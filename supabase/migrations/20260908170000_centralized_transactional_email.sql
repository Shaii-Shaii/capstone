begin;

create table if not exists public."Email_Outbox" (
  "Email_Outbox_ID" bigserial primary key,
  "User_ID" integer not null references public.users(user_id) on delete cascade,
  "Email_Type" text not null,
  "Reference_Type" text not null,
  "Reference_ID" text not null,
  "Event_Key" text not null,
  "Idempotency_Key" text not null,
  "Payload" jsonb not null default '{}'::jsonb,
  "Status" text not null default 'Pending',
  "Attempt_Count" integer not null default 0,
  "Max_Attempts" integer not null default 5,
  "Scheduled_At" timestamptz not null default now(),
  "Locked_At" timestamptz,
  "Sent_At" timestamptz,
  "Recipient_Email" text,
  "Subject" text,
  "Provider_Message_ID" text,
  "Delivery_Response" jsonb,
  "Last_Error" text,
  "Created_At" timestamptz not null default now(),
  "Updated_At" timestamptz not null default now(),
  constraint email_outbox_type_check check (
    "Email_Type" in (
      'donation_certificate',
      'donation_status_update',
      'donation_event_announcement',
      'donation_event_rsvp',
      'donation_event_reminder'
    )
  ),
  constraint email_outbox_status_check check (
    "Status" in ('Pending', 'Processing', 'Sent', 'Failed')
  ),
  constraint email_outbox_attempts_check check (
    "Attempt_Count" >= 0 and "Max_Attempts" between 1 and 20
  ),
  constraint email_outbox_payload_object_check check (jsonb_typeof("Payload") = 'object')
);

create unique index if not exists uq_email_outbox_idempotency
on public."Email_Outbox" ("Idempotency_Key");

create index if not exists idx_email_outbox_worker
on public."Email_Outbox" ("Status", "Scheduled_At", "Email_Outbox_ID")
where "Status" in ('Pending', 'Processing');

create index if not exists idx_email_outbox_reference
on public."Email_Outbox" ("Email_Type", "Reference_Type", "Reference_ID");

alter table public."Email_Outbox" enable row level security;
revoke all on public."Email_Outbox" from anon, authenticated;
revoke all on sequence public."Email_Outbox_Email_Outbox_ID_seq" from anon, authenticated;

create or replace function public.enqueue_donivra_email(
  p_user_id integer,
  p_email_type text,
  p_reference_type text,
  p_reference_id text,
  p_event_key text,
  p_payload jsonb default '{}'::jsonb,
  p_scheduled_at timestamptz default now()
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  outbox_id bigint;
  idempotency_key text;
begin
  if p_user_id is null
     or nullif(btrim(p_email_type), '') is null
     or nullif(btrim(p_reference_type), '') is null
     or nullif(btrim(p_reference_id), '') is null
     or nullif(btrim(p_event_key), '') is null then
    return null;
  end if;

  idempotency_key := concat_ws(
    ':',
    p_email_type,
    p_user_id::text,
    p_reference_type,
    p_reference_id,
    p_event_key
  );

  insert into public."Email_Outbox" (
    "User_ID",
    "Email_Type",
    "Reference_Type",
    "Reference_ID",
    "Event_Key",
    "Idempotency_Key",
    "Payload",
    "Scheduled_At"
  ) values (
    p_user_id,
    p_email_type,
    p_reference_type,
    p_reference_id,
    p_event_key,
    idempotency_key,
    coalesce(p_payload, '{}'::jsonb),
    coalesce(p_scheduled_at, now())
  )
  on conflict ("Idempotency_Key") do nothing
  returning "Email_Outbox_ID" into outbox_id;

  if outbox_id is null then
    select "Email_Outbox_ID" into outbox_id
    from public."Email_Outbox"
    where "Idempotency_Key" = idempotency_key;
  end if;

  return outbox_id;
end;
$$;

create or replace function public.claim_donivra_email_outbox(
  p_limit integer default 10,
  p_outbox_id bigint default null
)
returns table (
  email_outbox_id bigint,
  user_id integer,
  email_type text,
  reference_type text,
  reference_id text,
  event_key text,
  payload jsonb,
  status text,
  attempt_count integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with candidates as (
    select outbox."Email_Outbox_ID"
    from public."Email_Outbox" outbox
    where (
      outbox."Status" = 'Pending'
      or (
        outbox."Status" = 'Processing'
        and outbox."Locked_At" < now() - interval '15 minutes'
      )
    )
      and outbox."Scheduled_At" <= now()
      and outbox."Attempt_Count" < outbox."Max_Attempts"
      and (p_outbox_id is null or outbox."Email_Outbox_ID" = p_outbox_id)
    order by outbox."Scheduled_At", outbox."Email_Outbox_ID"
    limit least(greatest(coalesce(p_limit, 10), 1), 25)
    for update skip locked
  ), claimed as (
    update public."Email_Outbox" outbox
    set "Status" = 'Processing',
        "Attempt_Count" = outbox."Attempt_Count" + 1,
        "Locked_At" = now(),
        "Updated_At" = now()
    from candidates
    where outbox."Email_Outbox_ID" = candidates."Email_Outbox_ID"
    returning outbox.*
  )
  select
    claimed."Email_Outbox_ID",
    claimed."User_ID",
    claimed."Email_Type",
    claimed."Reference_Type",
    claimed."Reference_ID",
    claimed."Event_Key",
    claimed."Payload",
    claimed."Status",
    claimed."Attempt_Count",
    claimed."Max_Attempts"
  from claimed;
end;
$$;

revoke all on function public.enqueue_donivra_email(integer, text, text, text, text, jsonb, timestamptz)
from public, anon, authenticated;
revoke all on function public.claim_donivra_email_outbox(integer, bigint)
from public, anon, authenticated;
grant execute on function public.enqueue_donivra_email(integer, text, text, text, text, jsonb, timestamptz)
to service_role;
grant execute on function public.claim_donivra_email_outbox(integer, bigint)
to service_role;

create or replace function public.enqueue_certificate_email_after_issue()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.enqueue_donivra_email(
    new."User_ID",
    'donation_certificate',
    'donation_certificate',
    new."Certificate_ID"::text,
    'certificate_issued',
    jsonb_build_object(
      'certificate_id', new."Certificate_ID",
      'submission_id', new."Submission_ID",
      'issued_at', new."Issued_At"
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_enqueue_certificate_email_after_issue
on public."Donation_Certificates";
create trigger trg_enqueue_certificate_email_after_issue
after insert on public."Donation_Certificates"
for each row execute function public.enqueue_certificate_email_after_issue();

create or replace function public.enqueue_submission_status_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  milestone_key text;
  status_key text := public.normalize_flow_key(coalesce(new."Status", ''));
begin
  if new."Cut_At" is not null
     and (tg_op = 'INSERT' or old."Cut_At" is null) then
    milestone_key := 'donation_confirmed';
  elsif status_key = 'cut'
     and (tg_op = 'INSERT' or public.normalize_flow_key(coalesce(old."Status", '')) <> 'cut') then
    milestone_key := 'donation_confirmed';
  elsif new."Bundle_ID" is not null and new."Bundle_ID" is distinct from old."Bundle_ID" then
    milestone_key := 'hair_bundled';
  elsif new."Status" is distinct from old."Status" then
    milestone_key := case status_key
      when 'wiginproduction' then 'wig_in_production'
      when 'wigcreated' then 'wig_created'
      else null
    end;
  end if;

  if milestone_key is not null then
    perform public.enqueue_donivra_email(
      new."User_ID",
      'donation_status_update',
      'hair_submission',
      new."Submission_ID"::text,
      milestone_key,
      jsonb_build_object('milestone_key', milestone_key, 'updated_at', new."Updated_At")
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_submission_status_email
on public."Hair_Submissions";
create trigger trg_enqueue_submission_status_email
after insert or update of "Status", "Bundle_ID", "Cut_At"
on public."Hair_Submissions"
for each row execute function public.enqueue_submission_status_email();

create or replace function public.enqueue_submission_detail_status_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  submission_row public."Hair_Submissions"%rowtype;
  status_key text := public.normalize_flow_key(coalesce(new."Status", ''));
  old_status_key text := case when tg_op = 'UPDATE'
    then public.normalize_flow_key(coalesce(old."Status", ''))
    else ''
  end;
  milestone_key text;
begin
  if status_key = old_status_key then return new; end if;
  milestone_key := case status_key
    when 'approved' then 'hair_accepted'
    when 'accepted' then 'hair_accepted'
    when 'rejected' then 'hair_rejected'
    else null
  end;
  if milestone_key is null then return new; end if;

  select * into submission_row
  from public."Hair_Submissions"
  where "Submission_ID" = new."Submission_ID";
  if not found or submission_row."User_ID" is null then return new; end if;

  perform public.enqueue_donivra_email(
    submission_row."User_ID",
    'donation_status_update',
    'hair_submission',
    submission_row."Submission_ID"::text,
    milestone_key,
    jsonb_strip_nulls(jsonb_build_object(
      'milestone_key', milestone_key,
      'updated_at', new."Updated_At",
      'rejection_reason', case when milestone_key = 'hair_rejected' then new."Rejection_Reason" else null end
    ))
  );
  return new;
end;
$$;

drop trigger if exists trg_enqueue_submission_detail_status_email
on public."Hair_Submission_Details";
create trigger trg_enqueue_submission_detail_status_email
after insert or update of "Status"
on public."Hair_Submission_Details"
for each row execute function public.enqueue_submission_detail_status_email();

create or replace function public.enqueue_logistics_received_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  submission_row public."Hair_Submissions"%rowtype;
  became_received boolean;
begin
  became_received := new."Received_At" is not null
    and (tg_op = 'INSERT' or old."Received_At" is null);
  if not became_received
     and public.normalize_flow_key(coalesce(new."Shipment_Status", '')) not in (
       'received', 'receivedbyorganization', 'organizationreceived'
     ) then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new."Received_At" is not distinct from old."Received_At"
     and new."Shipment_Status" is not distinct from old."Shipment_Status" then
    return new;
  end if;

  select * into submission_row
  from public."Hair_Submissions"
  where "Submission_ID" = new."Submission_ID";
  if not found or submission_row."User_ID" is null then return new; end if;
  perform public.enqueue_donivra_email(
    submission_row."User_ID",
    'donation_status_update',
    'hair_submission',
    submission_row."Submission_ID"::text,
    'hair_received',
    jsonb_build_object(
      'milestone_key', 'hair_received',
      'updated_at', coalesce(new."Received_At", new."Updated_At")
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_enqueue_logistics_received_email
on public."Hair_Submission_Logistics";
create trigger trg_enqueue_logistics_received_email
after insert or update of "Shipment_Status", "Received_At"
on public."Hair_Submission_Logistics"
for each row execute function public.enqueue_logistics_received_email();

create or replace function public.enqueue_donor_wig_progress_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  milestone_key text;
  status_key text := public.normalize_flow_key(coalesce(new."Status", ''));
  submission_row record;
begin
  if tg_op = 'UPDATE' and new."Status" is not distinct from old."Status" then return new; end if;
  milestone_key := case status_key
    when 'acceptedinproduction' then 'wig_in_production'
    when 'acceptedwigallocated' then 'wig_assigned'
    when 'readyforpickup' then 'wig_ready_for_release'
    when 'toberelease' then 'preparing_for_release'
    when 'releasing' then 'wig_being_released'
    when 'released' then 'wig_received'
    else null
  end;
  if milestone_key is null then return new; end if;
  if milestone_key <> 'wig_in_production' and new."Allocated_Wig_ID" is null then return new; end if;

  for submission_row in
    select distinct submission."Submission_ID", submission."User_ID"
    from public."Hair_Submissions" submission
    where submission."User_ID" is not null
      and submission."Bundle_ID" is not null
      and (
        submission."Bundle_ID" = new."Fulfillment_Bundle_ID"
        or exists (
          select 1 from public."Wigs" wig
          where wig."Wig_ID" = new."Allocated_Wig_ID"
            and wig."Bundle_ID" = submission."Bundle_ID"
        )
      )
  loop
    perform public.enqueue_donivra_email(
      submission_row."User_ID",
      'donation_status_update',
      'hair_submission',
      submission_row."Submission_ID"::text,
      milestone_key,
      jsonb_build_object('milestone_key', milestone_key, 'updated_at', new."Updated_At")
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_donor_wig_progress_email
on public."Wig_Requests";
create trigger trg_enqueue_donor_wig_progress_email
after insert or update of "Status"
on public."Wig_Requests"
for each row execute function public.enqueue_donor_wig_progress_email();

create or replace function public.enqueue_event_rsvp_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new."User_ID" is null or new."Event_Request_ID" is null then return new; end if;
  if public.normalize_flow_key(coalesce(new."Registration_Status", '')) in (
    'cancelled', 'canceled', 'rejected'
  ) then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new."Registration_Status" is not distinct from old."Registration_Status" then
    return new;
  end if;
  perform public.enqueue_donivra_email(
    new."User_ID",
    'donation_event_rsvp',
    'donation_event',
    new."Event_Request_ID"::text,
    concat('rsvp:', new."Event_Attendee_ID"),
    jsonb_build_object('event_attendee_id', new."Event_Attendee_ID", 'updated_at', new."Updated_At")
  );
  return new;
end;
$$;

drop trigger if exists trg_enqueue_event_rsvp_email
on public."Event_Attendees";
create trigger trg_enqueue_event_rsvp_email
after insert or update of "Registration_Status"
on public."Event_Attendees"
for each row execute function public.enqueue_event_rsvp_email();

create or replace function public.enqueue_event_announcement_emails()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recipient record;
  event_key text;
  status_key text := public.normalize_flow_key(coalesce(new."Status", ''));
  old_status_key text := case when tg_op = 'UPDATE'
    then public.normalize_flow_key(coalesce(old."Status", ''))
    else ''
  end;
  is_meaningful_change boolean := false;
begin
  if status_key = 'approved' and old_status_key <> 'approved' then
    event_key := 'event_published';
    is_meaningful_change := true;
  elsif tg_op = 'UPDATE' and (
    new."Status" is distinct from old."Status"
    or new."Start_Date" is distinct from old."Start_Date"
    or new."End_Date" is distinct from old."End_Date"
    or new."Venue_Name" is distinct from old."Venue_Name"
    or new."Street" is distinct from old."Street"
    or new."Barangay" is distinct from old."Barangay"
    or new."City_Municipality" is distinct from old."City_Municipality"
    or new."Province" is distinct from old."Province"
  ) then
    event_key := concat('event_update:', extract(epoch from coalesce(new."Updated_At", now()))::bigint);
    is_meaningful_change := true;
  end if;
  if not is_meaningful_change then return new; end if;

  for recipient in
    select distinct recipients."User_ID"
    from (
      select attendee."User_ID"
      from public."Event_Attendees" attendee
      where attendee."Event_Request_ID" = new."Event_Request_ID"
        and attendee."User_ID" is not null
      union
      select access."User_ID"
      from public."Private_Event_Access" access
      where access."Event_Application_ID" = new."Event_Application_ID"
        and public.normalize_flow_key(coalesce(new."Event_Visibility", 'Public')) = 'private'
    ) recipients
  loop
    perform public.enqueue_donivra_email(
      recipient."User_ID",
      'donation_event_announcement',
      'donation_event',
      new."Event_Request_ID"::text,
      event_key,
      jsonb_build_object('event_status', new."Status", 'updated_at', new."Updated_At")
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_event_announcement_emails
on public."Event_Requests";
create trigger trg_enqueue_event_announcement_emails
after insert or update of "Status", "Start_Date", "End_Date", "Venue_Name",
  "Street", "Barangay", "City_Municipality", "Province"
on public."Event_Requests"
for each row execute function public.enqueue_event_announcement_emails();

create or replace function public.enqueue_due_donivra_event_reminders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reminder record;
  queued_count integer := 0;
begin
  for reminder in
    select request."Event_Request_ID", request."Start_Date", attendee."User_ID",
      request."Event_Visibility", request."Event_Application_ID"
    from public."Event_Requests" request
    join public."Event_Attendees" attendee
      on attendee."Event_Request_ID" = request."Event_Request_ID"
    where attendee."User_ID" is not null
      and public.normalize_flow_key(coalesce(request."Status", '')) = 'approved'
      and public.normalize_flow_key(coalesce(attendee."Registration_Status", 'registered'))
        not in ('cancelled', 'canceled', 'rejected')
      and request."Start_Date" > timezone('Asia/Manila', now())
      and request."Start_Date" <= timezone('Asia/Manila', now()) + interval '24 hours'
      and (
        public.normalize_flow_key(coalesce(request."Event_Visibility", 'Public')) <> 'private'
        or exists (
          select 1 from public."Private_Event_Access" access
          where access."Event_Application_ID" = request."Event_Application_ID"
            and access."User_ID" = attendee."User_ID"
        )
      )
  loop
    perform public.enqueue_donivra_email(
      reminder."User_ID",
      'donation_event_reminder',
      'donation_event',
      reminder."Event_Request_ID"::text,
      concat('24h:', extract(epoch from reminder."Start_Date")::bigint),
      jsonb_build_object('reminder_window', '24_hours', 'event_start', reminder."Start_Date")
    );
    queued_count := queued_count + 1;
  end loop;
  return queued_count;
end;
$$;

revoke all on function public.enqueue_due_donivra_event_reminders()
from public, anon, authenticated;
grant execute on function public.enqueue_due_donivra_event_reminders()
to service_role;

revoke all on function public.enqueue_certificate_email_after_issue() from public;
revoke all on function public.enqueue_submission_status_email() from public;
revoke all on function public.enqueue_submission_detail_status_email() from public;
revoke all on function public.enqueue_logistics_received_email() from public;
revoke all on function public.enqueue_donor_wig_progress_email() from public;
revoke all on function public.enqueue_event_rsvp_email() from public;
revoke all on function public.enqueue_event_announcement_emails() from public;

comment on table public."Email_Outbox"
is 'Server-owned transactional email outbox and delivery log. Recipient addresses are resolved by the Edge Function and are never accepted from clients.';

comment on column public."Email_Outbox"."Idempotency_Key"
is 'Unique business-event key that prevents repeated successful or pending email jobs for the same recipient and milestone.';

commit;

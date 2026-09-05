begin;

-- Event attendance proves that the donor arrived; it does not prove that the
-- donated hair passed the staff inspection.
drop trigger if exists trg_issue_event_certificate_after_rsvp_scan
on public."Event_Attendees";
drop function if exists public.issue_event_certificate_after_rsvp_scan();

-- Keep legacy rows for audit purposes, but detach relationships which cannot
-- truthfully represent an accepted hair donation. Nothing is deleted here.
update public."Donation_Certificates" certificate
set "Submission_ID" = null,
    "Remarks" = concat_ws(
      ' ',
      nullif(btrim(certificate."Remarks"), ''),
      '[Migration audit: invalid legacy Submission_ID was detached.]'
    )
where certificate."Submission_ID" is not null
  and not exists (
    select 1
    from public."Hair_Submissions" submission
    where submission."Submission_ID" = certificate."Submission_ID"
  );

update public."Donation_Certificates" certificate
set "Submission_ID" = null,
    "Remarks" = concat_ws(
      ' ',
      nullif(btrim(certificate."Remarks"), ''),
      '[Migration audit: certificate created before staff approval was detached.]'
    )
where certificate."Submission_ID" is not null
  and not exists (
    select 1
    from public."Hair_Submission_Details" detail
    where detail."Submission_ID" = certificate."Submission_ID"
      and public.normalize_flow_key(coalesce(detail."Status", '')) = 'approved'
  );

-- Preserve the earliest issued certificate as the canonical certificate when
-- legacy code created more than one for an accepted submission.
with ranked_certificates as (
  select
    "Certificate_ID",
    "Submission_ID",
    first_value("Certificate_ID") over (
      partition by "Submission_ID"
      order by "Issued_At" asc nulls last, "Certificate_ID" asc
    ) as canonical_certificate_id,
    row_number() over (
      partition by "Submission_ID"
      order by "Issued_At" asc nulls last, "Certificate_ID" asc
    ) as certificate_rank
  from public."Donation_Certificates"
  where "Submission_ID" is not null
)
update public."Donation_Certificates" certificate
set "Submission_ID" = null,
    "Remarks" = concat_ws(
      ' ',
      nullif(btrim(certificate."Remarks"), ''),
      format(
        '[Migration audit: duplicate of certificate %s was detached.]',
        ranked.canonical_certificate_id
      )
    )
from ranked_certificates ranked
where certificate."Certificate_ID" = ranked."Certificate_ID"
  and ranked.certificate_rank > 1;

-- A linked certificate always derives its donor from the master donation.
update public."Donation_Certificates" certificate
set "User_ID" = submission."User_ID"
from public."Hair_Submissions" submission
where submission."Submission_ID" = certificate."Submission_ID"
  and certificate."User_ID" is distinct from submission."User_ID";

alter table public."Donation_Certificates"
drop constraint if exists donation_certificates_submission_id_fkey;

alter table public."Donation_Certificates"
add constraint donation_certificates_submission_id_fkey
foreign key ("Submission_ID")
references public."Hair_Submissions" ("Submission_ID")
on delete restrict;

drop index if exists public.uq_donation_certificates_submission_id;
create unique index uq_donation_certificates_submission_id
on public."Donation_Certificates" ("Submission_ID")
where "Submission_ID" is not null;

alter table public."Donation_Certificates"
alter column "Issued_At"
set default timezone('Asia/Manila', now());

create or replace function public.generate_donation_certificate_number(
  p_submission_id integer,
  p_issued_at timestamp without time zone default timezone('Asia/Manila', now())
)
returns character varying
language sql
stable
set search_path = ''
as $$
  select format(
    'DON-%s-%s',
    extract(year from coalesce(p_issued_at, timezone('Asia/Manila', now())))::integer,
    lpad(p_submission_id::text, 6, '0')
  )::character varying;
$$;

-- Fill only missing numbers on valid, accepted legacy certificates. The
-- visible number is stable because it is derived once from the submission.
update public."Donation_Certificates" certificate
set "Certificate_Number" = public.generate_donation_certificate_number(
  certificate."Submission_ID",
  certificate."Issued_At"
)
where certificate."Submission_ID" is not null
  and nullif(btrim(coalesce(certificate."Certificate_Number", '')), '') is null;

create or replace function public.guard_donation_certificate_record()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  submission public."Hair_Submissions"%rowtype;
begin
  if new."Submission_ID" is null then
    if tg_op = 'INSERT' then
      raise exception 'A donation certificate requires an accepted Hair_Submissions record.';
    end if;
    return new;
  end if;

  select * into submission
  from public."Hair_Submissions"
  where "Submission_ID" = new."Submission_ID";

  if not found or submission."User_ID" is null then
    raise exception 'The certificate submission does not exist or has no donor.';
  end if;

  if not exists (
    select 1
    from public."Hair_Submission_Details" detail
    where detail."Submission_ID" = new."Submission_ID"
      and public.normalize_flow_key(coalesce(detail."Status", '')) = 'approved'
  ) then
    raise exception 'A donation certificate can only be issued after staff approves the actual donated hair.';
  end if;

  if new."Issued_By" is not null and not exists (
    select 1
    from public.users app_user
    where app_user.user_id = new."Issued_By"
      and lower(coalesce(app_user.role, '')) in (
        'admin', 'staff', 'qa_stylist', 'organization', 'super_admin'
      )
  ) then
    raise exception 'Issued_By must identify an authorized staff user.';
  end if;

  new."User_ID" := submission."User_ID";
  new."Issued_At" := coalesce(new."Issued_At", timezone('Asia/Manila', now()));
  new."Certificate_Number" := coalesce(
    nullif(btrim(new."Certificate_Number"), ''),
    public.generate_donation_certificate_number(new."Submission_ID", new."Issued_At")
  );
  new."Certificate_Type" := coalesce(
    nullif(btrim(new."Certificate_Type"), ''),
    'Hair Donation Certificate'
  );

  return new;
end;
$$;

drop trigger if exists trg_guard_donation_certificate_record
on public."Donation_Certificates";
create trigger trg_guard_donation_certificate_record
before insert or update of "Submission_ID", "User_ID", "Certificate_Number",
  "Certificate_Type", "Issued_By", "Issued_At"
on public."Donation_Certificates"
for each row
execute function public.guard_donation_certificate_record();

create or replace function public.guard_staff_hair_donation_approval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_user_id integer;
  old_is_approved boolean := false;
  new_is_approved boolean;
begin
  if tg_op = 'UPDATE' then
    old_is_approved := public.normalize_flow_key(coalesce(old."Status", '')) = 'approved';
  end if;
  new_is_approved := public.normalize_flow_key(coalesce(new."Status", '')) = 'approved';

  if new_is_approved and not old_is_approved then
    if coalesce(auth.role(), '') <> 'service_role'
       and (auth.uid() is null or not public.current_app_user_is_staff()) then
      raise exception 'Only authorized staff can approve an actual hair donation.'
        using errcode = '42501';
    end if;

    actor_user_id := coalesce(public.current_app_user_id(), new."Updated_By");
    if actor_user_id is null or not exists (
      select 1
      from public.users app_user
      where app_user.user_id = actor_user_id
        and lower(coalesce(app_user.role, '')) in (
          'admin', 'staff', 'qa_stylist', 'organization', 'super_admin'
        )
    ) then
      raise exception 'The approval must identify an authorized staff user.'
        using errcode = '42501';
    end if;

    new."Updated_By" := actor_user_id;
    new."Updated_At" := timezone('Asia/Manila', now());
  elsif old_is_approved and not new_is_approved and exists (
    select 1
    from public."Donation_Certificates" certificate
    where certificate."Submission_ID" = old."Submission_ID"
  ) then
    raise exception 'An approved donation with an issued certificate cannot be changed to a rejected state without a certificate-revocation workflow.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_staff_hair_donation_approval
on public."Hair_Submission_Details";
create trigger trg_guard_staff_hair_donation_approval
before insert or update of "Status"
on public."Hair_Submission_Details"
for each row
execute function public.guard_staff_hair_donation_approval();

create or replace function public.issue_donation_certificate_after_staff_approval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  submission public."Hair_Submissions"%rowtype;
  issued_at_value timestamp without time zone := timezone('Asia/Manila', now());
begin
  if public.normalize_flow_key(coalesce(new."Status", '')) <> 'approved'
     or (
       tg_op = 'UPDATE'
       and public.normalize_flow_key(coalesce(old."Status", '')) = 'approved'
     ) then
    return new;
  end if;

  select * into submission
  from public."Hair_Submissions"
  where "Submission_ID" = new."Submission_ID";

  if not found or submission."User_ID" is null then
    raise exception 'The approved hair detail is not linked to a valid donor submission.';
  end if;

  insert into public."Donation_Certificates" (
    "User_ID",
    "Certificate_Number",
    "Certificate_Type",
    "Issued_By",
    "Issued_At",
    "Remarks",
    "Submission_ID"
  ) values (
    submission."User_ID",
    public.generate_donation_certificate_number(submission."Submission_ID", issued_at_value),
    'Hair Donation Certificate',
    new."Updated_By",
    issued_at_value,
    'Issued after authorized staff approved the donated hair.',
    submission."Submission_ID"
  )
  on conflict ("Submission_ID") where "Submission_ID" is not null
  do nothing;

  return new;
end;
$$;

drop trigger if exists trg_issue_donation_certificate_after_staff_approval
on public."Hair_Submission_Details";
create trigger trg_issue_donation_certificate_after_staff_approval
after insert or update of "Status"
on public."Hair_Submission_Details"
for each row
execute function public.issue_donation_certificate_after_staff_approval();

-- Backfill accepted donations which predate this trigger. No certificate is
-- issued for pending, received-only, rejected, or cancelled donations.
insert into public."Donation_Certificates" (
  "User_ID",
  "Certificate_Number",
  "Certificate_Type",
  "Issued_By",
  "Issued_At",
  "Remarks",
  "Submission_ID"
)
select
  submission."User_ID",
  public.generate_donation_certificate_number(
    submission."Submission_ID",
    coalesce(detail."Updated_At", timezone('Asia/Manila', now()))
  ),
  'Hair Donation Certificate',
  case
    when exists (
      select 1
      from public.users app_user
      where app_user.user_id = detail."Updated_By"
        and lower(coalesce(app_user.role, '')) in (
          'admin', 'staff', 'qa_stylist', 'organization', 'super_admin'
        )
    ) then detail."Updated_By"
    else null
  end,
  coalesce(detail."Updated_At", timezone('Asia/Manila', now())),
  'Backfilled from an existing staff-approved donated-hair record.',
  submission."Submission_ID"
from public."Hair_Submission_Details" detail
join public."Hair_Submissions" submission
  on submission."Submission_ID" = detail."Submission_ID"
where public.normalize_flow_key(coalesce(detail."Status", '')) = 'approved'
on conflict ("Submission_ID") where "Submission_ID" is not null
do nothing;

alter table public."Donation_Certificates" enable row level security;

drop policy if exists "donors_read_own_donation_certificates"
on public."Donation_Certificates";
create policy "donors_read_own_donation_certificates"
on public."Donation_Certificates"
for select
to authenticated
using (
  "User_ID" = (select public.current_app_user_id())
  or (select public.current_app_user_is_staff())
);

-- Certificate issuance is performed by the approval trigger. The mobile
-- client, including donor accounts, has no direct certificate write access.
drop policy if exists "staff_insert_donation_certificates"
on public."Donation_Certificates";
drop policy if exists "staff_update_donation_certificates"
on public."Donation_Certificates";
drop policy if exists "staff_delete_donation_certificates"
on public."Donation_Certificates";

revoke insert, update, delete on public."Donation_Certificates" from anon, authenticated;
grant select on public."Donation_Certificates" to authenticated;

revoke all on function public.generate_donation_certificate_number(integer, timestamp without time zone)
from public, anon, authenticated;
revoke all on function public.guard_donation_certificate_record()
from public;
revoke all on function public.guard_staff_hair_donation_approval()
from public;
revoke all on function public.issue_donation_certificate_after_staff_approval()
from public;

comment on table public."Donation_Certificates"
is 'Issued certificates for staff-approved actual hair donations. One linked certificate is allowed per Hair_Submissions record.';

commit;

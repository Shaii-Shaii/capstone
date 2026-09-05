begin;

-- The UNIQUE constraint already owns a unique btree for this column pair.
-- Remove only the separately named duplicate, never the constraint index.
drop index if exists public.ux_private_event_access_event_user;

create index if not exists idx_private_event_access_user_application
on public."Private_Event_Access" ("User_ID", "Event_Application_ID");

alter table public."Private_Event_Access"
alter column "Unlocked_At"
set default timezone('Asia/Manila', now());

-- Retire direct legacy unlock entry points. The canonical code-only RPC below
-- resolves the authenticated user and the matching Event_Application itself.
do $$
begin
  if to_regprocedure('public.unlock_private_event(integer,text)') is not null then
    revoke all on function public.unlock_private_event(integer, text) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.unlock_private_event(bigint,text)') is not null then
    revoke all on function public.unlock_private_event(bigint, text) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.unlock_private_event_by_code(text)') is not null then
    revoke all on function public.unlock_private_event_by_code(text) from public, anon, authenticated;
  end if;
end;
$$;

-- Preserve donors who registered for a private event before explicit access
-- records became the authorization source of truth.
insert into public."Private_Event_Access" ("Event_Application_ID", "User_ID")
select distinct request."Event_Application_ID", attendee."User_ID"
from public."Event_Attendees" attendee
join public."Event_Requests" request
  on request."Event_Request_ID" = attendee."Event_Request_ID"
where attendee."User_ID" is not null
  and request."Event_Application_ID" is not null
  and public.normalize_flow_key(coalesce(request."Event_Visibility", 'Public')) = 'private'
on conflict ("Event_Application_ID", "User_ID") do nothing;

alter table public."Private_Event_Access" enable row level security;

drop policy if exists "users_read_own_private_event_access"
on public."Private_Event_Access";
create policy "users_read_own_private_event_access"
on public."Private_Event_Access"
for select
to authenticated
using (
  "User_ID" = (select public.current_app_user_id())
  or (select public.current_app_user_is_staff())
);

drop policy if exists "private_event_access_insert_staff_only"
on public."Private_Event_Access";
create policy "private_event_access_insert_staff_only"
on public."Private_Event_Access"
as restrictive
for insert
to authenticated
with check ((select public.current_app_user_is_staff()));

drop policy if exists "private_event_access_update_staff_only"
on public."Private_Event_Access";
create policy "private_event_access_update_staff_only"
on public."Private_Event_Access"
as restrictive
for update
to authenticated
using ((select public.current_app_user_is_staff()))
with check ((select public.current_app_user_is_staff()));

drop policy if exists "private_event_access_delete_staff_only"
on public."Private_Event_Access";
create policy "private_event_access_delete_staff_only"
on public."Private_Event_Access"
as restrictive
for delete
to authenticated
using ((select public.current_app_user_is_staff()));

-- Event_Requests may have older broad SELECT policies. A restrictive policy
-- is combined with every permissive policy and prevents private-row leakage.
alter table public."Event_Requests" enable row level security;

drop policy if exists "authenticated_private_event_access_guard"
on public."Event_Requests";
create policy "authenticated_private_event_access_guard"
on public."Event_Requests"
as restrictive
for select
to authenticated
using (
  public.normalize_flow_key(coalesce("Event_Visibility", 'Public')) <> 'private'
  or (select public.current_app_user_is_staff())
  or exists (
    select 1
    from public."Private_Event_Access" access
    where access."Event_Application_ID" = "Event_Requests"."Event_Application_ID"
      and access."User_ID" = (select public.current_app_user_id())
  )
);

drop policy if exists "anonymous_private_event_access_guard"
on public."Event_Requests";
create policy "anonymous_private_event_access_guard"
on public."Event_Requests"
as restrictive
for select
to anon
using (
  public.normalize_flow_key(coalesce("Event_Visibility", 'Public')) <> 'private'
);

create or replace function public.event_request_safe_payload(
  event_request public."Event_Requests"
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'event_request_id', event_request."Event_Request_ID",
    'donation_drive_id', event_request."Event_Request_ID",
    'event_application_id', event_request."Event_Application_ID",
    'event_title', event_request."Event_Name",
    'event_by', event_request."Event_By",
    'partnered_with', event_request."Partnered_With",
    'partner_social_media_link', event_request."Partner_Social_Media_Link",
    'start_date', event_request."Start_Date",
    'end_date', event_request."End_Date",
    'venue_name', event_request."Venue_Name",
    'event_image_url', event_request."Event_Photo_URL",
    'street', event_request."Street",
    'region', event_request."Region",
    'barangay', event_request."Barangay",
    'city', event_request."City_Municipality",
    'province', event_request."Province",
    'country', event_request."Country",
    'latitude', event_request."Latitude",
    'longitude', event_request."Longitude",
    'status', event_request."Status",
    'event_visibility', event_request."Event_Visibility",
    'staff_contact_notes', event_request."Staff_Contact_Notes",
    'admin_decision_reason', event_request."Admin_Decision_Reason",
    'updated_at', event_request."Updated_At"
  );
$$;

create or replace function public.get_authorized_upcoming_event_requests(
  p_limit integer default 60
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id integer;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to view donation events.' using errcode = '28000';
  end if;

  current_user_id := public.current_app_user_id();
  if current_user_id is null then
    raise exception 'Your signed-in account is not linked to an application user.' using errcode = '28000';
  end if;

  select coalesce(jsonb_agg(visible.payload order by visible.start_date asc), '[]'::jsonb)
  into result
  from (
    select
      public.event_request_safe_payload(request) as payload,
      request."Start_Date" as start_date
    from public."Event_Requests" request
    where public.normalize_flow_key(coalesce(request."Status", '')) = 'approved'
      and (
        request."End_Date" >= date_trunc('day', timezone('Asia/Manila', now()))
        or (request."End_Date" is null and request."Start_Date" >= date_trunc('day', timezone('Asia/Manila', now())))
      )
      and (
        public.normalize_flow_key(coalesce(request."Event_Visibility", 'Public')) <> 'private'
        or public.current_app_user_is_staff()
        or exists (
          select 1 from public."Private_Event_Access" access
          where access."Event_Application_ID" = request."Event_Application_ID"
            and access."User_ID" = current_user_id
        )
      )
    order by request."Start_Date" asc
    limit least(greatest(coalesce(p_limit, 60), 1), 100)
  ) visible;

  return result;
end;
$$;

create or replace function public.get_authorized_event_request(
  p_event_request_id integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id integer;
  event_request public."Event_Requests"%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to view this donation event.' using errcode = '28000';
  end if;

  current_user_id := public.current_app_user_id();
  if current_user_id is null then
    raise exception 'Your signed-in account is not linked to an application user.' using errcode = '28000';
  end if;

  select request.* into event_request
  from public."Event_Requests" request
  where request."Event_Request_ID" = p_event_request_id
    and public.normalize_flow_key(coalesce(request."Status", '')) = 'approved'
    and (
      public.normalize_flow_key(coalesce(request."Event_Visibility", 'Public')) <> 'private'
      or public.current_app_user_is_staff()
      or exists (
        select 1 from public."Private_Event_Access" access
        where access."Event_Application_ID" = request."Event_Application_ID"
          and access."User_ID" = current_user_id
      )
    );

  if not found then
    return null;
  end if;

  return public.event_request_safe_payload(event_request);
end;
$$;

-- This is the authoritative state-changing guard. Public events do not need
-- access rows; private events do. Donor RSVP additionally needs the latest
-- screening to satisfy the current wig_requirements row.
create or replace function public.guard_event_attendee_access_and_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_request record;
  current_user_id integer;
  screening_id integer;
  evaluation jsonb;
begin
  select request."Event_Application_ID", request."Event_Visibility", request."Status"
  into event_request
  from public."Event_Requests" request
  where request."Event_Request_ID" = new."Event_Request_ID";

  if not found or public.normalize_flow_key(coalesce(event_request."Status", '')) <> 'approved' then
    raise exception 'This donation event is not available.';
  end if;

  current_user_id := public.current_app_user_id();
  if auth.uid() is not null
     and not public.current_app_user_is_staff()
     and new."User_ID" is distinct from current_user_id then
    raise exception 'You cannot register another user for this event.' using errcode = '42501';
  end if;

  if auth.uid() is not null and not public.current_app_user_is_staff() then
    if tg_op = 'INSERT' and (
      new."RSVP_Scanned_At" is not null
      or new."RSVP_Scanned_By" is not null
      or public.normalize_flow_key(coalesce(new."Attendance_Status", 'Not Marked')) <> 'notmarked'
    ) then
      raise exception 'Only staff can check in an event attendee.' using errcode = '42501';
    elsif tg_op = 'UPDATE' and (
      new."RSVP_Scanned_At" is distinct from old."RSVP_Scanned_At"
      or new."RSVP_Scanned_By" is distinct from old."RSVP_Scanned_By"
      or new."Attendance_Status" is distinct from old."Attendance_Status"
      or new."Waybill_Code" is distinct from old."Waybill_Code"
    ) then
      raise exception 'Only staff can update event check-in fields.' using errcode = '42501';
    end if;
  end if;

  if public.normalize_flow_key(coalesce(event_request."Event_Visibility", 'Public')) = 'private'
     and not exists (
       select 1 from public."Private_Event_Access" access
       where access."Event_Application_ID" = event_request."Event_Application_ID"
         and access."User_ID" = new."User_ID"
     ) then
    raise exception 'Private event access is required before viewing or joining this event.' using errcode = '42501';
  end if;

  if public.normalize_flow_key(coalesce(new."Attendee_Type", 'Donor')) = 'donor' then
    select ai."AI_Screening_ID" into screening_id
    from public."AI_Screenings" ai
    where ai."User_ID" = new."User_ID"
      and nullif(btrim(coalesce(ai."Decision", '')), '') is not null
    order by ai."Created_At" desc nulls last, ai."AI_Screening_ID" desc
    limit 1;

    evaluation := public.evaluate_ai_screening_against_wig_requirements(screening_id);
    if screening_id is null or evaluation is null
       or coalesce((evaluation ->> 'configuration_error')::boolean, false)
       or not coalesce((evaluation ->> 'eligible')::boolean, false) then
      raise exception 'The donor''s latest AI hair screening does not satisfy the current wig requirements: %',
        coalesce(evaluation ->> 'reasons', 'no completed screening');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_event_attendee_access_and_eligibility
on public."Event_Attendees";
create trigger trg_guard_event_attendee_access_and_eligibility
before insert or update of "User_ID", "Event_Request_ID", "Attendee_Type",
  "Registration_Status", "Attendance_Status", "RSVP_Scanned_At",
  "RSVP_Scanned_By", "Waybill_Code"
on public."Event_Attendees"
for each row
execute function public.guard_event_attendee_access_and_eligibility();

drop policy if exists "donors_update_own_event_attendee_rsvp"
on public."Event_Attendees";
create policy "donors_update_own_event_attendee_rsvp"
on public."Event_Attendees"
for update
to authenticated
using ("User_ID" = (select public.current_app_user_id()))
with check ("User_ID" = (select public.current_app_user_id()));

revoke all on function public.event_request_safe_payload(public."Event_Requests") from public, anon, authenticated;
revoke all on function public.get_authorized_upcoming_event_requests(integer) from public, anon;
grant execute on function public.get_authorized_upcoming_event_requests(integer) to authenticated;
revoke all on function public.get_authorized_event_request(integer) from public, anon;
grant execute on function public.get_authorized_event_request(integer) to authenticated;
revoke all on function public.guard_event_attendee_access_and_eligibility() from public;

comment on table public."Private_Event_Access"
is 'Per-user authorization to access one private Event_Application; it does not represent hair eligibility or an RSVP.';

commit;

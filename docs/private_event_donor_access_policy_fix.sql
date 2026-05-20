-- Private event access policy fix for donor mobile.
-- Paste this whole block in Supabase SQL Editor.
-- It creates the helper function first, then applies the private event policies.

create or replace function public.mobile_current_user_id()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select u.user_id
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1
$$;

grant execute on function public.mobile_current_user_id() to authenticated;

grant select on table public."Private_Event_Access" to authenticated;
grant select on table public."Event_Requests" to anon, authenticated;
grant select on table public."Event_Attendees" to authenticated;
grant select on table public."Hair_Submissions" to authenticated;
grant select, insert on table public."Donation_Certificates" to authenticated;

alter table public."Private_Event_Access" enable row level security;
alter table public."Event_Requests" enable row level security;
alter table public."Event_Attendees" enable row level security;
alter table public."Hair_Submissions" enable row level security;
alter table public."Donation_Certificates" enable row level security;

drop policy if exists "Donors can read own private event access" on public."Private_Event_Access";
create policy "Donors can read own private event access"
  on public."Private_Event_Access"
  for select
  to authenticated
  using ("User_ID" = public.mobile_current_user_id());

drop policy if exists "Mobile users can read visible approved events" on public."Event_Requests";
create policy "Mobile users can read visible approved events"
  on public."Event_Requests"
  for select
  to anon, authenticated
  using (
    lower(replace(replace(replace(coalesce("Status", '')::text, '_', ''), ' ', ''), '-', '')) = 'approved'
    and (
      lower(replace(replace(replace(coalesce("Event_Visibility", 'Public')::text, '_', ''), ' ', ''), '-', '')) = 'public'
      or exists (
        select 1
        from public."Private_Event_Access" pea
        where pea."Event_Application_ID" = public."Event_Requests"."Event_Application_ID"
          and pea."User_ID" = public.mobile_current_user_id()
      )
    )
  );

drop policy if exists "Donors can read own event attendance" on public."Event_Attendees";
create policy "Donors can read own event attendance"
  on public."Event_Attendees"
  for select
  to authenticated
  using ("User_ID" = public.mobile_current_user_id());

drop policy if exists "Donors can read own hair submissions" on public."Hair_Submissions";
create policy "Donors can read own hair submissions"
  on public."Hair_Submissions"
  for select
  to authenticated
  using ("User_ID" = public.mobile_current_user_id());

drop policy if exists "Donors can read own donation certificates" on public."Donation_Certificates";
create policy "Donors can read own donation certificates"
  on public."Donation_Certificates"
  for select
  to authenticated
  using ("User_ID" = public.mobile_current_user_id());

drop policy if exists "Donors can create certificate after cut ship scan" on public."Donation_Certificates";
create policy "Donors can create certificate after cut ship scan"
  on public."Donation_Certificates"
  for insert
  to authenticated
  with check (
    "User_ID" = public.mobile_current_user_id()
    and exists (
      select 1
      from public."Hair_Submissions" hs
      join public."Event_Attendees" ea
        on ea."Event_Request_ID" = hs."Event_Request_ID"
       and ea."User_ID" = hs."User_ID"
      where hs."Submission_ID" = public."Donation_Certificates"."Submission_ID"
        and hs."User_ID" = public.mobile_current_user_id()
        and hs."Event_Request_ID" is not null
        and (
          ea."RSVP_Scanned_At" is not null
          or lower(replace(replace(replace(coalesce(ea."Attendance_Status", '')::text, '_', ''), ' ', ''), '-', '')) in (
            'present',
            'attended',
            'checkedin',
            'marked',
            'scanned',
            'verified'
          )
        )
    )
  );

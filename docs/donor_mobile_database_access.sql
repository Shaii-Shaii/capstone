-- Donor mobile app database access for the updated schema.
-- Paste this in the Supabase SQL editor for the project used by the app.
-- It maps auth.uid() to public.users.user_id, then lets donors access only
-- their own registrations, submissions, details, images, logistics, results,
-- recommendations, and certificates.

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

grant select on table public.users to authenticated;
grant select on table public."Private_Event_Access" to authenticated;
grant select on table public."Event_Requests" to anon, authenticated;
grant select, insert, update on table public."Event_Attendees" to authenticated;
grant select, insert, update on table public."Hair_Submissions" to authenticated;
grant select, insert, update on table public."Hair_Submission_Details" to authenticated;
grant select, insert on table public."Hair_Submission_Images" to authenticated;
grant select, insert, update on table public."Hair_Submission_Logistics" to authenticated;
grant select on table public."Hair_Bundle_Tracking_History" to authenticated;
grant select on table public."AI_Screenings" to authenticated;
grant select on table public."Donor_Recommendations" to authenticated;
grant select, insert on table public."Donation_Certificates" to authenticated;
grant select on table public."Logistics_Settings" to authenticated;
grant select on table public.wig_requirements to anon, authenticated;

alter table public.users enable row level security;
alter table public."Private_Event_Access" enable row level security;
alter table public."Event_Requests" enable row level security;
alter table public."Event_Attendees" enable row level security;
alter table public."Hair_Submissions" enable row level security;
alter table public."Hair_Submission_Details" enable row level security;
alter table public."Hair_Submission_Images" enable row level security;
alter table public."Hair_Submission_Logistics" enable row level security;
alter table public."Hair_Bundle_Tracking_History" enable row level security;
alter table public."AI_Screenings" enable row level security;
alter table public."Donor_Recommendations" enable row level security;
alter table public."Donation_Certificates" enable row level security;
alter table public."Logistics_Settings" enable row level security;
alter table public.wig_requirements enable row level security;

drop policy if exists "Mobile users can read own account row" on public.users;
create policy "Mobile users can read own account row"
  on public.users
  for select
  to authenticated
  using (auth_user_id = auth.uid());

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

drop policy if exists "Donors can read own event attendees" on public."Event_Attendees";
create policy "Donors can read own event attendees"
  on public."Event_Attendees"
  for select
  to authenticated
  using ("User_ID" = public.mobile_current_user_id());

drop policy if exists "Donors can create own event attendees" on public."Event_Attendees";
create policy "Donors can create own event attendees"
  on public."Event_Attendees"
  for insert
  to authenticated
  with check ("User_ID" = public.mobile_current_user_id());

drop policy if exists "Donors can update own event attendees" on public."Event_Attendees";
create policy "Donors can update own event attendees"
  on public."Event_Attendees"
  for update
  to authenticated
  using ("User_ID" = public.mobile_current_user_id())
  with check ("User_ID" = public.mobile_current_user_id());

drop policy if exists "Donors can read own hair submissions" on public."Hair_Submissions";
create policy "Donors can read own hair submissions"
  on public."Hair_Submissions"
  for select
  to authenticated
  using ("User_ID" = public.mobile_current_user_id());

drop policy if exists "Donors can create own hair submissions" on public."Hair_Submissions";
create policy "Donors can create own hair submissions"
  on public."Hair_Submissions"
  for insert
  to authenticated
  with check ("User_ID" = public.mobile_current_user_id());

drop policy if exists "Donors can update own hair submissions" on public."Hair_Submissions";
create policy "Donors can update own hair submissions"
  on public."Hair_Submissions"
  for update
  to authenticated
  using ("User_ID" = public.mobile_current_user_id())
  with check ("User_ID" = public.mobile_current_user_id());

drop policy if exists "Donors can read own hair submission details" on public."Hair_Submission_Details";
create policy "Donors can read own hair submission details"
  on public."Hair_Submission_Details"
  for select
  to authenticated
  using (
    exists (
      select 1
      from public."Hair_Submissions" hs
      where hs."Submission_ID" = public."Hair_Submission_Details"."Submission_ID"
        and hs."User_ID" = public.mobile_current_user_id()
    )
  );

drop policy if exists "Donors can create own hair submission details" on public."Hair_Submission_Details";
create policy "Donors can create own hair submission details"
  on public."Hair_Submission_Details"
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public."Hair_Submissions" hs
      where hs."Submission_ID" = public."Hair_Submission_Details"."Submission_ID"
        and hs."User_ID" = public.mobile_current_user_id()
    )
  );

drop policy if exists "Donors can update own hair submission details" on public."Hair_Submission_Details";
create policy "Donors can update own hair submission details"
  on public."Hair_Submission_Details"
  for update
  to authenticated
  using (
    exists (
      select 1
      from public."Hair_Submissions" hs
      where hs."Submission_ID" = public."Hair_Submission_Details"."Submission_ID"
        and hs."User_ID" = public.mobile_current_user_id()
    )
  )
  with check (
    exists (
      select 1
      from public."Hair_Submissions" hs
      where hs."Submission_ID" = public."Hair_Submission_Details"."Submission_ID"
        and hs."User_ID" = public.mobile_current_user_id()
    )
  );

drop policy if exists "Donors can read own hair submission images" on public."Hair_Submission_Images";
create policy "Donors can read own hair submission images"
  on public."Hair_Submission_Images"
  for select
  to authenticated
  using (
    exists (
      select 1
      from public."Hair_Submission_Details" hsd
      join public."Hair_Submissions" hs on hs."Submission_ID" = hsd."Submission_ID"
      where hsd."Submission_Detail_ID" = public."Hair_Submission_Images"."Submission_Detail_ID"
        and hs."User_ID" = public.mobile_current_user_id()
    )
  );

drop policy if exists "Donors can create own hair submission images" on public."Hair_Submission_Images";
create policy "Donors can create own hair submission images"
  on public."Hair_Submission_Images"
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public."Hair_Submission_Details" hsd
      join public."Hair_Submissions" hs on hs."Submission_ID" = hsd."Submission_ID"
      where hsd."Submission_Detail_ID" = public."Hair_Submission_Images"."Submission_Detail_ID"
        and hs."User_ID" = public.mobile_current_user_id()
    )
  );

drop policy if exists "Donors can read own hair submission logistics" on public."Hair_Submission_Logistics";
create policy "Donors can read own hair submission logistics"
  on public."Hair_Submission_Logistics"
  for select
  to authenticated
  using (
    exists (
      select 1
      from public."Hair_Submissions" hs
      where hs."Submission_ID" = public."Hair_Submission_Logistics"."Submission_ID"
        and hs."User_ID" = public.mobile_current_user_id()
    )
  );

drop policy if exists "Donors can create own hair submission logistics" on public."Hair_Submission_Logistics";
create policy "Donors can create own hair submission logistics"
  on public."Hair_Submission_Logistics"
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public."Hair_Submissions" hs
      where hs."Submission_ID" = public."Hair_Submission_Logistics"."Submission_ID"
        and hs."User_ID" = public.mobile_current_user_id()
    )
  );

drop policy if exists "Donors can update own hair submission logistics" on public."Hair_Submission_Logistics";
create policy "Donors can update own hair submission logistics"
  on public."Hair_Submission_Logistics"
  for update
  to authenticated
  using (
    exists (
      select 1
      from public."Hair_Submissions" hs
      where hs."Submission_ID" = public."Hair_Submission_Logistics"."Submission_ID"
        and hs."User_ID" = public.mobile_current_user_id()
    )
  )
  with check (
    exists (
      select 1
      from public."Hair_Submissions" hs
      where hs."Submission_ID" = public."Hair_Submission_Logistics"."Submission_ID"
        and hs."User_ID" = public.mobile_current_user_id()
    )
  );

drop policy if exists "Donors can read own tracking history" on public."Hair_Bundle_Tracking_History";
create policy "Donors can read own tracking history"
  on public."Hair_Bundle_Tracking_History"
  for select
  to authenticated
  using (
    exists (
      select 1
      from public."Hair_Submissions" hs
      where hs."Submission_ID" = public."Hair_Bundle_Tracking_History"."Submission_ID"
        and hs."User_ID" = public.mobile_current_user_id()
    )
  );

drop policy if exists "Donors can read own AI screenings" on public."AI_Screenings";
create policy "Donors can read own AI screenings"
  on public."AI_Screenings"
  for select
  to authenticated
  using (
    exists (
      select 1
      from public."Hair_Submissions" hs
      where hs."Submission_ID" = public."AI_Screenings"."Submission_ID"
        and hs."User_ID" = public.mobile_current_user_id()
    )
  );

drop policy if exists "Donors can read own recommendations" on public."Donor_Recommendations";
create policy "Donors can read own recommendations"
  on public."Donor_Recommendations"
  for select
  to authenticated
  using (
    exists (
      select 1
      from public."Hair_Submissions" hs
      where hs."Submission_ID" = public."Donor_Recommendations"."Submission_ID"
        and hs."User_ID" = public.mobile_current_user_id()
    )
  );

drop policy if exists "Donors can read own certificates" on public."Donation_Certificates";
create policy "Donors can read own certificates"
  on public."Donation_Certificates"
  for select
  to authenticated
  using ("User_ID" = public.mobile_current_user_id());

drop policy if exists "Donors can create own attendance certificates" on public."Donation_Certificates";
create policy "Donors can create own attendance certificates"
  on public."Donation_Certificates"
  for insert
  to authenticated
  with check ("User_ID" = public.mobile_current_user_id());

drop policy if exists "Mobile users can read logistics settings" on public."Logistics_Settings";
create policy "Mobile users can read logistics settings"
  on public."Logistics_Settings"
  for select
  to authenticated
  using (true);

drop policy if exists "Mobile users can read wig requirements" on public.wig_requirements;
create policy "Mobile users can read wig requirements"
  on public.wig_requirements
  for select
  to anon, authenticated
  using (true);

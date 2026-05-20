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

alter table public."Private_Event_Access" enable row level security;
alter table public."Event_Requests" enable row level security;

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

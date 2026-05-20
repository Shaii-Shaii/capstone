-- Mobile app database access fixes.
-- Run this in the Supabase SQL editor for the project used by the app.
-- The app reads wig_requirements to evaluate donor hair eligibility.
-- The patient try-on screen reads active Wig_AI_Filters and linked wig metadata.

grant select on table public.wig_requirements to anon, authenticated;
grant select on table public."Wig_AI_Filters" to anon, authenticated;
grant select on table public."Wigs" to anon, authenticated;
grant select on table public."Wig_Specifications" to anon, authenticated;

alter table public.wig_requirements enable row level security;
alter table public."Wig_AI_Filters" enable row level security;
alter table public."Wigs" enable row level security;
alter table public."Wig_Specifications" enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'wig_requirements'
      and policyname = 'Mobile users can read wig requirements'
  ) then
    create policy "Mobile users can read wig requirements"
      on public.wig_requirements
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'Wig_AI_Filters'
      and policyname = 'Mobile users can read active wig AI filters'
  ) then
    create policy "Mobile users can read active wig AI filters"
      on public."Wig_AI_Filters"
      for select
      to anon, authenticated
      using ("Is_Active" = true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'Wigs'
      and policyname = 'Mobile users can read wigs'
  ) then
    create policy "Mobile users can read wigs"
      on public."Wigs"
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'Wig_Specifications'
      and policyname = 'Mobile users can read wig specifications'
  ) then
    create policy "Mobile users can read wig specifications"
      on public."Wig_Specifications"
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

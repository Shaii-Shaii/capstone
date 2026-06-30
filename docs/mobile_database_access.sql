-- Mobile app database access fixes.
-- Run this in the Supabase SQL editor for the project used by the app.
-- The app reads wig_requirements to evaluate donor hair eligibility.

grant select on table public.wig_requirements to anon, authenticated;

alter table public.wig_requirements enable row level security;

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

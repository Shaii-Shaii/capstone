begin;

alter table public."Wig_Requests"
  add column if not exists "Expected_Release_At" timestamp with time zone null,
  add column if not exists "Expected_Release_Updated_At" timestamp with time zone null,
  add column if not exists "Expected_Release_Updated_By" integer null,
  add column if not exists "Expected_Release_Note" text null;

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'Wig_Requests_Expected_Release_Updated_By_fkey'
      and conrelid = 'public."Wig_Requests"'::regclass
  ) then
    alter table public."Wig_Requests"
      add constraint "Wig_Requests_Expected_Release_Updated_By_fkey"
      foreign key ("Expected_Release_Updated_By")
      references public.users(user_id)
      on delete set null;
  end if;
end;
$block$;

create index if not exists "idx_Wig_Requests_Expected_Release_At"
on public."Wig_Requests" ("Expected_Release_At")
where "Expected_Release_At" is not null;

create or replace function public.guard_wig_request_expected_release_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.current_app_user_is_staff() and (
    (
      tg_op = 'INSERT'
      and (
        new."Expected_Release_At" is not null
        or new."Expected_Release_Updated_At" is not null
        or new."Expected_Release_Updated_By" is not null
        or new."Expected_Release_Note" is not null
      )
    )
    or (
      tg_op = 'UPDATE'
      and (
        new."Expected_Release_At" is distinct from old."Expected_Release_At"
        or new."Expected_Release_Updated_At" is distinct from old."Expected_Release_Updated_At"
        or new."Expected_Release_Updated_By" is distinct from old."Expected_Release_Updated_By"
        or new."Expected_Release_Note" is distinct from old."Expected_Release_Note"
      )
    )
  ) then
    raise exception 'Only authorized staff can update the expected wig release schedule';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_wig_request_expected_release_fields on public."Wig_Requests";
create trigger trg_guard_wig_request_expected_release_fields
before update of
  "Expected_Release_At",
  "Expected_Release_Updated_At",
  "Expected_Release_Updated_By",
  "Expected_Release_Note"
on public."Wig_Requests"
for each row
execute function public.guard_wig_request_expected_release_fields();

drop trigger if exists trg_guard_wig_request_expected_release_insert on public."Wig_Requests";
create trigger trg_guard_wig_request_expected_release_insert
before insert on public."Wig_Requests"
for each row
execute function public.guard_wig_request_expected_release_fields();

create or replace function public.staff_set_wig_request_expected_release(
  p_req_id integer,
  p_expected_release_at timestamp with time zone,
  p_expected_release_note text default null
)
returns public."Wig_Requests"
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor public.users%rowtype;
  v_request public."Wig_Requests"%rowtype;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_expected_release_at is null then raise exception 'Expected release date and time are required'; end if;
  if length(coalesce(p_expected_release_note, '')) > 500 then
    raise exception 'Expected release note must be 500 characters or fewer';
  end if;

  select * into v_actor
  from public.users actor
  where actor.auth_user_id = auth.uid()
    and actor.is_active is distinct from false
  limit 1;

  if v_actor.user_id is null
    or public.normalize_app_role(v_actor.role) not in ('staff', 'admin', 'superadmin')
  then
    raise exception 'Only active staff or admin accounts can update the expected wig release schedule';
  end if;

  select * into v_request
  from public."Wig_Requests" request_row
  where request_row."Req_ID" = p_req_id
  for update;

  if v_request."Req_ID" is null then raise exception 'Wig request was not found'; end if;
  v_status := lower(trim(coalesce(v_request."Status", '')));

  if v_status not in (
    'accepted - wig allocated',
    'accepted - in production',
    'ready for pick-up',
    'to be release',
    'appealed'
  ) then
    raise exception 'The request has not reached a stage where an expected release can be set';
  end if;

  if v_status = 'appealed' and not exists (
    select 1
    from public.wig_release_appeals appeal
    where appeal.req_id = p_req_id
      and appeal.status = 'Approved for Replacement'
      and appeal.requested_resolution = 'Repair or Replace'
  ) then
    raise exception 'A new estimate is only available for an approved repair or replacement';
  end if;

  update public."Wig_Requests"
  set "Expected_Release_At" = p_expected_release_at,
      "Expected_Release_Updated_At" = now(),
      "Expected_Release_Updated_By" = v_actor.user_id,
      "Expected_Release_Note" = nullif(trim(coalesce(p_expected_release_note, '')), ''),
      "Updated_At" = timezone('Asia/Manila', now())
  where "Req_ID" = p_req_id
  returning * into v_request;

  insert into public.audit_logs (user_id, action, description, user_email, resource, status)
  values (
    v_actor.user_id,
    'wig_requests.expected_release_updated',
    format('request_id=%s expected_release_at=%s', p_req_id, p_expected_release_at),
    v_actor.email,
    'Wig_Requests',
    'success'
  );

  return v_request;
end;
$function$;

revoke all on function public.staff_set_wig_request_expected_release(integer, timestamp with time zone, text) from public, anon;
grant execute on function public.staff_set_wig_request_expected_release(integer, timestamp with time zone, text) to authenticated;

notify pgrst, 'reload schema';
commit;

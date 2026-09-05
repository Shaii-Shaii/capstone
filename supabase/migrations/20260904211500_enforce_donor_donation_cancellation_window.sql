begin;

-- Donors may cancel only during the first seven days, and staff approval closes
-- that window immediately. Staff and trusted backend workflows retain their
-- existing ability to close donations for operational reasons such as No Show.
create or replace function public.guard_donor_donation_cancellation_window()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_user_id integer := public.current_app_user_id();
  actor_is_staff boolean := public.current_app_user_is_staff();
  donation_created_at timestamp without time zone;
begin
  if public.normalize_flow_key(coalesce(old."Status", '')) = 'cancelled'
     or public.normalize_flow_key(coalesce(new."Status", '')) <> 'cancelled' then
    return new;
  end if;

  -- Apply this rule only when the authenticated donor is cancelling their own
  -- donation. Staff actions, database jobs, and trigger-driven No Show closures
  -- continue through their dedicated authorization and workflow checks.
  if actor_user_id is distinct from old."User_ID" or actor_is_staff then
    return new;
  end if;

  if public.normalize_flow_key(coalesce(old."Status", '')) in ('approved', 'accepted')
     or exists (
       select 1
       from public."Hair_Submission_Details" detail
       where detail."Submission_ID" = old."Submission_ID"
         and public.normalize_flow_key(coalesce(detail."Status", '')) in ('approved', 'accepted')
     )
     or exists (
       select 1
       from public."Donation_Certificates" certificate
       where certificate."Submission_ID" = old."Submission_ID"
     ) then
    raise exception 'Approved donations can no longer be cancelled.'
      using errcode = '23514';
  end if;

  donation_created_at := old."Created_At";
  if donation_created_at is null then
    raise exception 'The donation cancellation period could not be verified.'
      using errcode = '23514';
  end if;

  if timezone('Asia/Manila', now()) > donation_created_at + interval '7 days' then
    raise exception 'The 7-day cancellation period has ended.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_donor_donation_cancellation_window
on public."Hair_Submissions";

create trigger trg_guard_donor_donation_cancellation_window
before update of "Status"
on public."Hair_Submissions"
for each row
execute function public.guard_donor_donation_cancellation_window();

revoke all on function public.guard_donor_donation_cancellation_window() from public;

comment on function public.guard_donor_donation_cancellation_window()
is 'Allows a donor to cancel their own unapproved Hair_Submission only during its first seven days; staff and trusted backend closures remain separate.';

commit;

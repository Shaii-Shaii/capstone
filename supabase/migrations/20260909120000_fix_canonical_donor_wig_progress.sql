begin;

-- Return only privacy-safe fulfillment milestones for a donor-owned donation.
-- A released request reaches the release milestone; only confirmation on the
-- latest release cycle completes the final Wig Received milestone.
create or replace function public.get_donor_timeline_wig_progress(
  p_submission_id integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id integer;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to view donation progress.'
      using errcode = '28000';
  end if;

  current_user_id := public.current_app_user_id();
  if current_user_id is null then
    raise exception 'Your signed-in account is not linked to an application user.'
      using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public."Hair_Submissions" owned_submission
    where owned_submission."Submission_ID" = p_submission_id
      and owned_submission."User_ID" = current_user_id
  ) then
    raise exception 'This donation timeline is not available for your account.'
      using errcode = '42501';
  end if;

  with related_progress as (
    select
      public.normalize_flow_key(coalesce(request."Status", '')) as request_status,
      case
        when public.normalize_flow_key(coalesce(request."Status", '')) = 'released'
          and latest_receipt.received_confirmed_at is not null then 10
        when public.normalize_flow_key(coalesce(request."Status", '')) = 'released' then 9
        when public.normalize_flow_key(coalesce(request."Status", '')) = 'releasing' then 9
        when public.normalize_flow_key(coalesce(request."Status", '')) = 'toberelease' then 8
        when public.normalize_flow_key(coalesce(request."Status", '')) = 'readyforpickup' then 7
        when public.normalize_flow_key(coalesce(request."Status", '')) = 'acceptedwigallocated' then 6
        when public.normalize_flow_key(coalesce(request."Status", '')) = 'acceptedinproduction' then 4
        else null
      end as milestone_index,
      case
        when public.normalize_flow_key(coalesce(request."Status", '')) = 'released'
          and latest_receipt.received_confirmed_at is not null then 'wig_received'
        when public.normalize_flow_key(coalesce(request."Status", '')) in ('released', 'releasing') then 'wig_being_released'
        when public.normalize_flow_key(coalesce(request."Status", '')) = 'toberelease' then 'preparing_for_release'
        when public.normalize_flow_key(coalesce(request."Status", '')) = 'readyforpickup' then 'wig_ready_for_release'
        when public.normalize_flow_key(coalesce(request."Status", '')) = 'acceptedwigallocated' then 'wig_assigned'
        when public.normalize_flow_key(coalesce(request."Status", '')) = 'acceptedinproduction' then 'wig_in_production'
        else null
      end as milestone_key,
      case
        when public.normalize_flow_key(coalesce(request."Status", '')) = 'released'
          and latest_receipt.received_confirmed_at is not null then latest_receipt.received_confirmed_at
        else request."Updated_At"
      end as milestone_at,
      public.normalize_flow_key(coalesce(request."Status", '')) = 'released' as released,
      latest_receipt.received_confirmed_at is not null as receipt_confirmed,
      latest_receipt.received_confirmed_at,
      latest_receipt.release_cycle,
      public.normalize_flow_key(coalesce(request."Status", '')) = 'released' as milestone_completed,
      request."Updated_At" as request_updated_at
    from public."Hair_Submissions" submission
    join public."Wig_Requests" request
      on request."Fulfillment_Bundle_ID" = submission."Bundle_ID"
      or exists (
        select 1
        from public."Wigs" allocated_wig
        where allocated_wig."Wig_ID" = request."Allocated_Wig_ID"
          and allocated_wig."Bundle_ID" = submission."Bundle_ID"
      )
    left join lateral (
      select receipt.release_cycle, receipt.received_confirmed_at
      from public.wig_release_receipts receipt
      where receipt.req_id = request."Req_ID"
      order by receipt.release_cycle desc
      limit 1
    ) latest_receipt on true
    where submission."Submission_ID" = p_submission_id
      and submission."User_ID" = current_user_id
      and submission."Bundle_ID" is not null
      and public.normalize_flow_key(coalesce(request."Status", '')) in (
        'acceptedinproduction',
        'acceptedwigallocated',
        'readyforpickup',
        'toberelease',
        'releasing',
        'released'
      )
      and (
        public.normalize_flow_key(coalesce(request."Status", '')) = 'acceptedinproduction'
        or request."Allocated_Wig_ID" is not null
      )
  ), highest_progress as (
    select *
    from related_progress
    where milestone_index is not null
    order by milestone_index desc, request_updated_at desc nulls last
    limit 1
  )
  select jsonb_build_object(
    'milestone_index', highest.milestone_index,
    'milestone_key', highest.milestone_key,
    'milestone_at', highest.milestone_at,
    'milestone_completed', highest.milestone_completed,
    'request_status', highest.request_status,
    'released', highest.released,
    'receipt_confirmed', highest.receipt_confirmed,
    'received_confirmed_at', highest.received_confirmed_at,
    'release_cycle', highest.release_cycle
  )
  into result
  from highest_progress highest;

  return coalesce(result, jsonb_build_object(
    'milestone_index', null,
    'milestone_key', null,
    'milestone_at', null,
    'milestone_completed', false,
    'request_status', null,
    'released', false,
    'receipt_confirmed', false,
    'received_confirmed_at', null,
    'release_cycle', null
  ));
end;
$$;

revoke all on function public.get_donor_timeline_wig_progress(integer)
from public, anon;
grant execute on function public.get_donor_timeline_wig_progress(integer)
to authenticated;

comment on function public.get_donor_timeline_wig_progress(integer)
is 'Returns the highest privacy-safe donor wig milestone; final receipt requires confirmation on the latest release cycle.';

commit;

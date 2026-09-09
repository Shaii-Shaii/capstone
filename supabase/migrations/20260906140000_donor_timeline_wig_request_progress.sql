begin;

-- Expose only the wig milestone needed by the donor timeline. The function
-- verifies submission ownership and never returns request, patient, hospital,
-- allocation, or wig identifiers.
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
      case public.normalize_flow_key(coalesce(request."Status", ''))
        when 'acceptedinproduction' then 4
        when 'acceptedwigallocated' then 6
        when 'readyforpickup' then 7
        when 'toberelease' then 8
        when 'releasing' then 9
        when 'released' then 10
        else null
      end as milestone_index,
      case public.normalize_flow_key(coalesce(request."Status", ''))
        when 'acceptedinproduction' then 'wig_in_production'
        when 'acceptedwigallocated' then 'wig_assigned'
        when 'readyforpickup' then 'wig_ready_for_release'
        when 'toberelease' then 'preparing_for_release'
        when 'releasing' then 'wig_being_released'
        when 'released' then 'wig_received'
        else null
      end as milestone_key,
      request."Updated_At" as milestone_at
    from public."Hair_Submissions" submission
    join public."Wig_Requests" request
      on request."Fulfillment_Bundle_ID" = submission."Bundle_ID"
      or exists (
        select 1
        from public."Wigs" allocated_wig
        where allocated_wig."Wig_ID" = request."Allocated_Wig_ID"
          and allocated_wig."Bundle_ID" = submission."Bundle_ID"
      )
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
      -- Allocation and later release milestones require a real allocated wig.
      and (
        public.normalize_flow_key(coalesce(request."Status", '')) = 'acceptedinproduction'
        or request."Allocated_Wig_ID" is not null
      )
  ), highest_progress as (
    select milestone_index, milestone_key, milestone_at
    from related_progress
    where milestone_index is not null
    order by milestone_index desc, milestone_at desc nulls last
    limit 1
  )
  select jsonb_build_object(
    'milestone_index', highest.milestone_index,
    'milestone_key', highest.milestone_key,
    'milestone_at', highest.milestone_at
  )
  into result
  from highest_progress highest;

  return coalesce(result, jsonb_build_object(
    'milestone_index', null,
    'milestone_key', null,
    'milestone_at', null
  ));
end;
$$;

revoke all on function public.get_donor_timeline_wig_progress(integer)
from public, anon;
grant execute on function public.get_donor_timeline_wig_progress(integer)
to authenticated;

comment on function public.get_donor_timeline_wig_progress(integer)
is 'Returns only the highest privacy-safe Wig_Requests milestone for an authenticated donor-owned Hair_Submissions timeline.';

commit;

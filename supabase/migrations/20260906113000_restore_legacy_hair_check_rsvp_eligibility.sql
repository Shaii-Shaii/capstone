begin;

-- Hair analysis now creates a standalone AI_Screenings row and only links it to
-- Hair_Submissions after a donor actually starts a donation. Older app versions
-- created a source=CheckHair placeholder submission during analysis. The mobile
-- app already treats those rows as screening history rather than donations, but
-- latest_ai_screening_id_for_user still treated them as consumed screenings.

create temporary table legacy_checkhair_screening_links
on commit drop
as
select
  submission."Submission_ID" as submission_id,
  screening."AI_Screening_ID" as ai_screening_id
from public."Hair_Submissions" submission
join public."AI_Screenings" screening
  on screening."Submission_ID" = submission."Submission_ID"
 and submission."AI_Screening_ID" = screening."AI_Screening_ID"
 and screening."User_ID" = submission."User_ID"
where coalesce(submission."From_Event", false) = false
  and submission."Event_Request_ID" is null
  and submission."Event_Attendee_ID" is null
  and public.normalize_flow_key(coalesce(submission."Donor_Notes", ''))
    like '%sourcecheckhair%';

-- Release both sides of only those legacy CheckHair placeholder links. Genuine
-- independent/event donations retain their screening links and remain blocked
-- from reusing the same screening.
update public."AI_Screenings" screening
set "Submission_ID" = null
from legacy_checkhair_screening_links legacy
where screening."AI_Screening_ID" = legacy.ai_screening_id
  and screening."Submission_ID" = legacy.submission_id;

-- The normal guard correctly forbids application code from unlinking a real
-- donation. Disable it only for this transactional, narrowly-selected backfill.
alter table public."Hair_Submissions"
disable trigger trg_guard_hair_submission_eligible_screening;

update public."Hair_Submissions" submission
set "AI_Screening_ID" = null
from legacy_checkhair_screening_links legacy
where submission."Submission_ID" = legacy.submission_id
  and submission."AI_Screening_ID" = legacy.ai_screening_id;

alter table public."Hair_Submissions"
enable trigger trg_guard_hair_submission_eligible_screening;

create or replace function public.latest_ai_screening_id_for_user(p_user_id integer)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select screening."AI_Screening_ID"
  from public."AI_Screenings" screening
  where screening."User_ID" = p_user_id
    and screening."Submission_ID" is null
    -- Older event-registration functions copied/seeded screenings. Preserve
    -- those historical rows, but never treat them as a new Hair Check.
    and public.normalize_flow_key(coalesce(screening."Analysis_Result" ->> 'source', ''))
      <> 'manualseed'
    and coalesce(screening."Summary", '') not ilike '%Copied into event donation registration.%'
    and not exists (
      select 1
      from public."Hair_Submissions" prior_submission
      where prior_submission."User_ID" = p_user_id
        and public.normalize_flow_key(coalesce(prior_submission."Status", ''))
          not in ('cancelled', 'canceled')
        and prior_submission."Created_At" >= screening."Created_At"
        -- A legacy source=CheckHair row is analysis history, not an active or
        -- completed donation, so it must not consume a standalone screening.
        and not (
          coalesce(prior_submission."From_Event", false) = false
          and prior_submission."Event_Request_ID" is null
          and prior_submission."Event_Attendee_ID" is null
          and public.normalize_flow_key(coalesce(prior_submission."Donor_Notes", ''))
            like '%sourcecheckhair%'
        )
    )
  order by screening."Created_At" desc nulls last,
           screening."AI_Screening_ID" desc
  limit 1;
$$;

-- RSVP answers a different question from donation creation: does the donor's
-- newest real AI result satisfy today's wig requirements? It must not discard
-- that result merely because it has a historical submission link.
create or replace function public.latest_ai_screening_result_id_for_user(p_user_id integer)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select screening."AI_Screening_ID"
  from public."AI_Screenings" screening
  where screening."User_ID" = p_user_id
    and public.normalize_flow_key(coalesce(screening."Analysis_Result" ->> 'source', ''))
      <> 'manualseed'
    and coalesce(screening."Summary", '') not ilike '%Copied into event donation registration.%'
  order by screening."Created_At" desc nulls last,
           screening."AI_Screening_ID" desc
  limit 1;
$$;

-- Private-event authorization is unchanged. For a donor RSVP, re-evaluate the
-- newest AI_Screenings observations against the latest wig_requirements row.
-- Do not use the cached Decision column or the donation-link availability flag.
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
       select 1
       from public."Private_Event_Access" access
       where access."Event_Application_ID" = event_request."Event_Application_ID"
         and access."User_ID" = new."User_ID"
     ) then
    raise exception 'Private event access is required before viewing or joining this event.'
      using errcode = '42501';
  end if;

  if public.normalize_flow_key(coalesce(new."Attendee_Type", 'Donor')) = 'donor'
     and not exists (
       select 1
       from public."Hair_Submissions" submission
       where submission."Event_Attendee_ID" = new."Event_Attendee_ID"
     ) then
    screening_id := public.latest_ai_screening_result_id_for_user(new."User_ID");
    evaluation := public.evaluate_ai_screening_against_wig_requirements(screening_id);

    if screening_id is null then
      raise exception 'The donor must complete Hair Check before joining this event.';
    elsif evaluation is null then
      raise exception 'The donor''s latest Hair Check could not be evaluated.';
    elsif coalesce((evaluation ->> 'configuration_error')::boolean, false) then
      raise exception 'Donation requirements are currently unavailable. Please try again later or contact the organization.';
    elsif not coalesce((evaluation ->> 'eligible')::boolean, false) then
      raise exception 'The donor''s latest Hair Check does not satisfy the current wig requirements: %',
        coalesce(evaluation ->> 'reasons', 'requirements not satisfied');
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.latest_ai_screening_result_id_for_user(integer)
from public, anon, authenticated;

comment on function public.latest_ai_screening_id_for_user(integer)
is 'Returns the latest unconsumed Hair Check. Legacy source=CheckHair analysis placeholders do not consume eligibility; genuine donation submissions do.';

comment on function public.latest_ai_screening_result_id_for_user(integer)
is 'Returns the latest real AI_Screenings result for current wig_requirements RSVP evaluation, independent of donation-link availability.';

commit;

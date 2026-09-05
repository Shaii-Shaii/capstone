begin;

-- Legacy RSVP automation copied or seeded AI screenings. Event operations now
-- reuse a real Hair Check and must never invoke that workflow again.
drop trigger if exists trg_ensure_event_donation_records_after_rsvp
on public."Event_Attendees";
drop function if exists public.ensure_event_donation_records_after_rsvp();

-- AI_Screenings stores observations. Decision remains a synchronized display
-- cache, while every authorization path evaluates the current policy again.
drop trigger if exists trg_enforce_ai_screening_wig_requirements
on public."AI_Screenings";
drop function if exists public.enforce_ai_screening_wig_requirements();

alter table public."AI_Screenings"
alter column "Decision" set default 'Analysis completed';

comment on column public."AI_Screenings"."Decision"
is 'Current eligibility display cache synchronized from wig_requirements. Never use this column alone to authorize a donation; re-evaluate current requirements.';

create or replace function public.evaluate_hair_observations_against_wig_requirements(
  p_estimated_length_cm numeric,
  p_detected_texture text,
  p_analysis_result jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  requirement public.wig_requirements%rowtype;
  reasons text[] := array[]::text[];
  failures jsonb := '[]'::jsonb;
  passes jsonb := '[]'::jsonb;
  minimum_length_cm numeric;
  observed boolean;
  observed_value jsonb;
  observed_text text;
  configured_rule text;
  configured_disallows boolean;
  configured_textures text;
begin
  select * into requirement
  from public.wig_requirements
  order by "Updated_At" desc nulls last, "Wig_Requirement_ID" desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'eligible', null,
      'decision', null,
      'configuration_error', true,
      'reasons', jsonb_build_array(
        'Donation requirements are currently unavailable. Please try again later or contact the organization.'
      ),
      'failed_requirements', '[]'::jsonb,
      'passed_requirements', '[]'::jsonb,
      'evaluated_requirements', null
    );
  end if;

  minimum_length_cm := requirement."Minimum_Hair_Length" * 2.54;
  if minimum_length_cm is not null
     and (p_estimated_length_cm is null or p_estimated_length_cm < minimum_length_cm) then
    reasons := array_append(
      reasons,
      case
        when p_estimated_length_cm is null then format(
          'Hair length could not be measured against the configured minimum of %s inches.',
          requirement."Minimum_Hair_Length"
        )
        else format(
          'Minimum hair length requires %s inches; the Hair Check detected %s inches.',
          requirement."Minimum_Hair_Length",
          round(p_estimated_length_cm / 2.54, 1)
        )
      end
    );
    failures := failures || jsonb_build_array(jsonb_build_object(
      'requirement', 'minimum_hair_length',
      'required_inches', requirement."Minimum_Hair_Length",
      'detected_cm', p_estimated_length_cm,
      'detected_inches', case
        when p_estimated_length_cm is null then null
        else round(p_estimated_length_cm / 2.54, 1)
      end
    ));
  elsif minimum_length_cm is not null then
    passes := passes || jsonb_build_array(jsonb_build_object(
      'requirement', 'minimum_hair_length',
      'required_inches', requirement."Minimum_Hair_Length",
      'detected_cm', p_estimated_length_cm,
      'detected_inches', round(p_estimated_length_cm / 2.54, 1)
    ));
  end if;

  -- Existing donor requirement UI labels true as accepted and false as
  -- blocked. Keep that established meaning for every treatment flag.
  foreach configured_rule in array array[
    'Chemical_Treatment_Status|chemical_treatment_detected|chemically treated',
    'Colored_Hair_Status|colored_hair_detected|colored',
    'Bleached_Hair_Status|bleached_hair_detected|bleached',
    'Rebonded_Hair_Status|rebonded_hair_detected|rebonded'
  ] loop
    configured_disallows := case split_part(configured_rule, '|', 1)
      when 'Chemical_Treatment_Status' then requirement."Chemical_Treatment_Status" = false
      when 'Colored_Hair_Status' then requirement."Colored_Hair_Status" = false
      when 'Bleached_Hair_Status' then requirement."Bleached_Hair_Status" = false
      when 'Rebonded_Hair_Status' then requirement."Rebonded_Hair_Status" = false
      else false
    end;

    if configured_disallows then
      observed_value := coalesce(p_analysis_result, '{}'::jsonb)
        -> split_part(configured_rule, '|', 2);
      observed_text := lower(btrim(coalesce(observed_value #>> '{}', '')));
      observed := case
        when jsonb_typeof(observed_value) = 'boolean' then observed_text::boolean
        when observed_text in ('true', 'yes', 'detected') then true
        when observed_text in ('false', 'no', 'not detected', 'none') then false
        else null
      end;

      if observed is true then
        reasons := array_append(reasons, format(
          'The current donation requirements do not allow %s hair.',
          split_part(configured_rule, '|', 3)
        ));
        failures := failures || jsonb_build_array(jsonb_build_object(
          'requirement', split_part(configured_rule, '|', 2),
          'allowed', false,
          'detected', true
        ));
      elsif observed is null then
        reasons := array_append(reasons, format(
          'The Hair Check did not record whether the hair is %s. Complete a new Hair Check using the current requirements.',
          split_part(configured_rule, '|', 3)
        ));
        failures := failures || jsonb_build_array(jsonb_build_object(
          'requirement', split_part(configured_rule, '|', 2),
          'allowed', false,
          'detected', null,
          'reason', 'observation_missing'
        ));
      else
        passes := passes || jsonb_build_array(jsonb_build_object(
          'requirement', split_part(configured_rule, '|', 2),
          'allowed', false,
          'detected', false
        ));
      end if;
    elsif configured_disallows is false then
      passes := passes || jsonb_build_array(jsonb_build_object(
        'requirement', split_part(configured_rule, '|', 2),
        'allowed', true
      ));
    end if;
  end loop;

  configured_textures := nullif(btrim(coalesce(requirement."Hair_Texture_Status", '')), '');
  if configured_textures is not null
     and public.normalize_flow_key(configured_textures) not in (
       'any', 'all', 'anyhairtexture', 'allhairtypes', 'none',
       'norestriction', 'notrestricted'
     )
     and not exists (
       select 1
       from regexp_split_to_table(configured_textures, '[,;/|\n]+') allowed(texture)
       where public.normalize_flow_key(allowed.texture)
         = public.normalize_flow_key(coalesce(p_detected_texture, ''))
     ) then
    reasons := array_append(reasons, format(
      'Detected hair texture (%s) does not match the configured allowed texture (%s).',
      coalesce(nullif(btrim(p_detected_texture), ''), 'unknown'),
      configured_textures
    ));
    failures := failures || jsonb_build_array(jsonb_build_object(
      'requirement', 'hair_texture',
      'allowed', configured_textures,
      'detected', nullif(btrim(coalesce(p_detected_texture, '')), '')
    ));
  elsif configured_textures is not null then
    passes := passes || jsonb_build_array(jsonb_build_object(
      'requirement', 'hair_texture',
      'allowed', configured_textures,
      'detected', nullif(btrim(coalesce(p_detected_texture, '')), '')
    ));
  end if;

  return jsonb_build_object(
    'eligible', cardinality(reasons) = 0,
    'decision', case when cardinality(reasons) = 0 then 'Eligible' else 'Ineligible' end,
    'configuration_error', false,
    'reasons', to_jsonb(reasons),
    'passed_requirements', passes,
    'failed_requirements', failures,
    'evaluated_requirements', jsonb_build_object(
      'wig_requirement_id', requirement."Wig_Requirement_ID",
      'updated_at', requirement."Updated_At",
      'minimum_hair_length_inches', requirement."Minimum_Hair_Length",
      'chemical_treatment_allowed', requirement."Chemical_Treatment_Status",
      'colored_hair_allowed', requirement."Colored_Hair_Status",
      'bleached_hair_allowed', requirement."Bleached_Hair_Status",
      'rebonded_hair_allowed', requirement."Rebonded_Hair_Status",
      'allowed_hair_texture', requirement."Hair_Texture_Status"
    ),
    'wig_requirement_id', requirement."Wig_Requirement_ID",
    'wig_requirement_updated_at', requirement."Updated_At",
    'minimum_hair_length_inches', requirement."Minimum_Hair_Length"
  );
end;
$$;

create or replace function public.evaluate_ai_screening_against_wig_requirements(
  p_ai_screening_id integer
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.evaluate_hair_observations_against_wig_requirements(
    screening."Estimated_Length",
    screening."Detected_Texture",
    coalesce(screening."Analysis_Result", '{}'::jsonb)
  )
  from public."AI_Screenings" screening
  where screening."AI_Screening_ID" = p_ai_screening_id;
$$;

-- Used by the analysis service before a row exists. The caller supplies only
-- observations; policy is still loaded and evaluated inside PostgreSQL.
create or replace function public.evaluate_current_hair_observations(
  p_estimated_length_cm numeric,
  p_detected_texture text,
  p_analysis_result jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to evaluate hair eligibility.'
      using errcode = '28000';
  end if;

  return public.evaluate_hair_observations_against_wig_requirements(
    p_estimated_length_cm,
    p_detected_texture,
    coalesce(p_analysis_result, '{}'::jsonb)
  );
end;
$$;

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
    )
  order by screening."Created_At" desc nulls last,
           screening."AI_Screening_ID" desc
  limit 1;
$$;

-- Decision is a synchronized display cache only. All authorization functions
-- below still call the evaluator and never trust the stored text.
create or replace function public.sync_ai_screening_current_decision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  evaluation jsonb;
begin
  evaluation := public.evaluate_hair_observations_against_wig_requirements(
    new."Estimated_Length",
    new."Detected_Texture",
    coalesce(new."Analysis_Result", '{}'::jsonb)
  );

  new."Decision" := case
    when coalesce((evaluation ->> 'configuration_error')::boolean, false)
      then 'Requirements unavailable'
    when coalesce((evaluation ->> 'eligible')::boolean, false)
      then 'Eligible'
    else 'Ineligible'
  end;
  return new;
end;
$$;

drop trigger if exists trg_sync_ai_screening_current_decision
on public."AI_Screenings";
create trigger trg_sync_ai_screening_current_decision
before insert or update of "Estimated_Length", "Detected_Texture", "Analysis_Result", "Decision"
on public."AI_Screenings"
for each row
execute function public.sync_ai_screening_current_decision();

create or replace function public.refresh_ai_screening_decisions_after_requirement_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public."AI_Screenings"
  set "Decision" = "Decision";
  return null;
end;
$$;

drop trigger if exists trg_refresh_ai_screening_decisions_after_requirement_change
on public.wig_requirements;
create trigger trg_refresh_ai_screening_decisions_after_requirement_change
after insert or update or delete
on public.wig_requirements
for each statement
execute function public.refresh_ai_screening_decisions_after_requirement_change();

-- Refresh legacy rows once. Their measurements and original analysis payload
-- remain untouched; only the compatibility Decision cache changes.
update public."AI_Screenings"
set "Decision" = "Decision";

-- Backfill only missing reverse links from the authoritative parent link.
-- Never overwrite a screening already attached to another submission.
-- Older RSVP automation created manual_seed screening copies and attached
-- those copies to the submission. Preserve those historical rows and their
-- observations, but release only their stale reverse link so the real Hair
-- Check referenced by Hair_Submissions can be linked below.
update public."AI_Screenings" occupied
set "Submission_ID" = null
from public."Hair_Submissions" submission
join public."AI_Screenings" screening
  on screening."AI_Screening_ID" = submission."AI_Screening_ID"
where occupied."Submission_ID" = submission."Submission_ID"
  and occupied."AI_Screening_ID" <> screening."AI_Screening_ID"
  and screening."Submission_ID" is null
  and occupied."User_ID" = submission."User_ID"
  and (
    public.normalize_flow_key(coalesce(occupied."Analysis_Result" ->> 'source', '')) = 'manualseed'
    or coalesce(occupied."Summary", '') ilike '%Copied into event donation registration.%'
  );

-- Refuse to guess if a conflict remains and the occupying screening was not
-- one of the known event-generated legacy copies.
do $$
begin
  if exists (
    select 1
    from public."Hair_Submissions" submission
    join public."AI_Screenings" screening
      on screening."AI_Screening_ID" = submission."AI_Screening_ID"
    join public."AI_Screenings" occupied
      on occupied."Submission_ID" = submission."Submission_ID"
     and occupied."AI_Screening_ID" <> screening."AI_Screening_ID"
    where screening."Submission_ID" is null
  ) then
    raise exception 'A Hair_Submission and AI_Screening reverse link conflict must be resolved before applying this migration.';
  end if;
end;
$$;

update public."AI_Screenings" screening
set "Submission_ID" = submission."Submission_ID"
from public."Hair_Submissions" submission
where submission."AI_Screening_ID" = screening."AI_Screening_ID"
  and submission."User_ID" = screening."User_ID"
  and screening."Submission_ID" is null;

do $$
begin
  if exists (
    select 1
    from public."AI_Screenings" screening
    left join public."Hair_Submissions" submission
      on submission."Submission_ID" = screening."Submission_ID"
    where screening."Submission_ID" is not null
      and (
        submission."Submission_ID" is null
        or submission."AI_Screening_ID" is distinct from screening."AI_Screening_ID"
        or submission."User_ID" is distinct from screening."User_ID"
      )
  ) then
    raise exception 'Existing AI_Screenings.Submission_ID links are orphaned or inconsistent. Resolve them before applying this migration.';
  end if;

  if exists (
    select 1
    from public."Hair_Submissions" submission
    join public."AI_Screenings" screening
      on screening."AI_Screening_ID" = submission."AI_Screening_ID"
    where submission."AI_Screening_ID" is not null
      and (
        screening."User_ID" is distinct from submission."User_ID"
        or screening."Submission_ID" is distinct from submission."Submission_ID"
      )
  ) then
    raise exception 'Existing Hair_Submissions.AI_Screening_ID links are inconsistent. Resolve them before applying this migration.';
  end if;
end;
$$;

alter table public."AI_Screenings"
drop constraint if exists ai_screenings_submission_id_fkey;
alter table public."AI_Screenings"
add constraint ai_screenings_submission_id_fkey
foreign key ("Submission_ID")
references public."Hair_Submissions" ("Submission_ID")
on delete set null;

create or replace function public.guard_ai_screening_submission_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and old."Submission_ID" is not null
     and new."Submission_ID" is not null
     and new."Submission_ID" <> old."Submission_ID" then
    raise exception 'An AI screening already linked to a donation cannot be reassigned.';
  end if;

  if new."Submission_ID" is not null and not exists (
    select 1
    from public."Hair_Submissions" submission
    where submission."Submission_ID" = new."Submission_ID"
      and submission."AI_Screening_ID" = new."AI_Screening_ID"
      and submission."User_ID" = new."User_ID"
  ) then
    raise exception 'AI screening and Hair_Submission links must point to each other and belong to the same donor.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_ai_screening_submission_link
on public."AI_Screenings";
create trigger trg_guard_ai_screening_submission_link
before insert or update of "Submission_ID"
on public."AI_Screenings"
for each row
execute function public.guard_ai_screening_submission_link();

create or replace function public.link_hair_submission_existing_ai_screening()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  screening record;
begin
  if new."AI_Screening_ID" is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old."AI_Screening_ID" is not null
     and new."AI_Screening_ID" <> old."AI_Screening_ID" then
    raise exception 'A donation already linked to an AI screening cannot be reassigned.';
  end if;

  select candidate."User_ID", candidate."Submission_ID"
  into screening
  from public."AI_Screenings" candidate
  where candidate."AI_Screening_ID" = new."AI_Screening_ID"
  for update;

  if not found or screening."User_ID" is distinct from new."User_ID" then
    raise exception 'The selected AI screening does not belong to this donor.';
  end if;

  if screening."Submission_ID" is not null
     and screening."Submission_ID" <> new."Submission_ID" then
    raise exception 'This AI screening is already linked to another donation.';
  end if;

  if screening."Submission_ID" is null then
    update public."AI_Screenings"
    set "Submission_ID" = new."Submission_ID"
    where "AI_Screening_ID" = new."AI_Screening_ID";
  end if;

  return new;
end;
$$;

drop trigger if exists trg_link_hair_submission_existing_ai_screening
on public."Hair_Submissions";
create trigger trg_link_hair_submission_existing_ai_screening
after insert or update of "AI_Screening_ID", "User_ID"
on public."Hair_Submissions"
for each row
execute function public.link_hair_submission_existing_ai_screening();

create or replace function public.get_current_hair_eligibility(
  p_ai_screening_id integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id integer;
  screening record;
  evaluation jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to evaluate hair eligibility.'
      using errcode = '28000';
  end if;

  current_user_id := public.current_app_user_id();
  if current_user_id is null then
    raise exception 'Your signed-in account is not linked to an application user.'
      using errcode = '28000';
  end if;

  select
    candidate."AI_Screening_ID",
    candidate."User_ID",
    candidate."Submission_ID",
    candidate."Created_At",
    candidate."Estimated_Length",
    candidate."Detected_Texture"
  into screening
  from public."AI_Screenings" candidate
  where candidate."AI_Screening_ID" = coalesce(
    p_ai_screening_id,
    public.latest_ai_screening_id_for_user(current_user_id)
  )
    and (
      candidate."User_ID" = current_user_id
      or public.current_app_user_is_staff()
    );

  if not found then
    return jsonb_build_object(
      'screening_exists', false,
      'eligible', null,
      'configuration_error', false,
      'reasons', '[]'::jsonb,
      'failed_requirements', '[]'::jsonb
    );
  end if;

  evaluation := public.evaluate_ai_screening_against_wig_requirements(
    screening."AI_Screening_ID"
  );

  return coalesce(evaluation, '{}'::jsonb) || jsonb_build_object(
    'screening_exists', true,
    'ai_screening_id', screening."AI_Screening_ID",
    'user_id', screening."User_ID",
    'submission_id', screening."Submission_ID",
    'screening_created_at', screening."Created_At",
    'detected_length_cm', screening."Estimated_Length",
    'detected_texture', screening."Detected_Texture",
    'available_for_new_donation', screening."AI_Screening_ID"
      = public.latest_ai_screening_id_for_user(screening."User_ID"),
    'evaluation_source', 'current_wig_requirements'
  );
end;
$$;

create or replace function public.guard_hair_submission_eligible_screening()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  latest_screening_id integer;
  evaluation jsonb;
begin
  if tg_op = 'UPDATE' and exists (
    select 1
    from public."Hair_Submission_Details" detail
    where detail."Submission_ID" = old."Submission_ID"
      and public.normalize_flow_key(coalesce(detail."Status", '')) = 'approved'
  ) then
    if new."User_ID" is distinct from old."User_ID"
       or new."AI_Screening_ID" is distinct from old."AI_Screening_ID" then
      raise exception 'An accepted donation cannot be relinked after staff approval.';
    end if;
    return new;
  end if;

  if new."AI_Screening_ID" is null then
    raise exception 'An eligible AI screening is required before starting a hair donation.';
  end if;

  latest_screening_id := public.latest_ai_screening_id_for_user(new."User_ID");
  if latest_screening_id is null
     or new."AI_Screening_ID" <> latest_screening_id
     or not exists (
       select 1
       from public."AI_Screenings" screening
       where screening."AI_Screening_ID" = new."AI_Screening_ID"
         and screening."User_ID" = new."User_ID"
     ) then
    raise exception 'The donor''s latest Hair Check is required before starting a donation.';
  end if;

  evaluation := public.evaluate_ai_screening_against_wig_requirements(
    new."AI_Screening_ID"
  );
  if evaluation is null then
    raise exception 'The selected Hair Check could not be evaluated.';
  elsif coalesce((evaluation ->> 'configuration_error')::boolean, false) then
    raise exception 'Donation requirements are currently unavailable. Please try again later or contact the organization.';
  elsif not coalesce((evaluation ->> 'eligible')::boolean, false) then
    raise exception 'The donor''s latest Hair Check does not satisfy the current wig requirements: %',
      coalesce(evaluation ->> 'reasons', 'requirements not satisfied');
  end if;

  return new;
end;
$$;

create or replace function public.start_event_hair_donation_after_check_in()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  screening_id integer;
  evaluation jsonb;
  existing_submission_id integer;
begin
  if new."User_ID" is null
     or new."Event_Request_ID" is null
     or new."RSVP_Scanned_At" is null
     or public.normalize_flow_key(coalesce(new."Registration_Status", '')) <> 'registered'
     or public.normalize_flow_key(coalesce(new."Attendance_Status", '')) <> 'present'
     or public.normalize_flow_key(coalesce(new."Attendee_Type", 'Donor')) <> 'donor' then
    return new;
  end if;

  select submission."Submission_ID" into existing_submission_id
  from public."Hair_Submissions" submission
  where submission."Event_Attendee_ID" = new."Event_Attendee_ID"
  order by submission."Created_At" desc nulls last,
           submission."Submission_ID" desc
  limit 1;

  -- Requirement changes affect future donations, never an existing donation.
  if existing_submission_id is not null then
    return new;
  end if;

  screening_id := public.latest_ai_screening_id_for_user(new."User_ID");
  evaluation := public.evaluate_ai_screening_against_wig_requirements(screening_id);

  if screening_id is null then
    raise exception 'This donor must complete Hair Check before event donation check-in.';
  elsif evaluation is null then
    raise exception 'This donor''s latest Hair Check could not be evaluated.';
  elsif coalesce((evaluation ->> 'configuration_error')::boolean, false) then
    raise exception 'Donation requirements are currently unavailable. Please try again later or contact the organization.';
  elsif not coalesce((evaluation ->> 'eligible')::boolean, false) then
    raise exception 'This donor''s latest Hair Check does not satisfy the current wig requirements: %',
      coalesce(evaluation ->> 'reasons', 'requirements not satisfied');
  end if;

  insert into public."Hair_Submissions" (
    "User_ID",
    "AI_Screening_ID",
    "Event_Request_ID",
    "Event_Attendee_ID",
    "From_Event",
    "Status"
  ) values (
    new."User_ID",
    screening_id,
    new."Event_Request_ID",
    new."Event_Attendee_ID",
    true,
    'Pending'
  );

  return new;
end;
$$;

-- Private-event authorization remains independent. This trigger performs the
-- current eligibility check for RSVP/attendee writes without reading Decision.
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

  -- Eligibility gates a future donation. Once this attendee already owns the
  -- master donation record, later policy changes must not invalidate or block
  -- updates to that historical donation journey.
  if public.normalize_flow_key(coalesce(new."Attendee_Type", 'Donor')) = 'donor'
     and not exists (
       select 1
       from public."Hair_Submissions" submission
       where submission."Event_Attendee_ID" = new."Event_Attendee_ID"
     ) then
    screening_id := public.latest_ai_screening_id_for_user(new."User_ID");
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

revoke all on function public.evaluate_hair_observations_against_wig_requirements(numeric, text, jsonb)
from public, anon, authenticated;
revoke all on function public.evaluate_ai_screening_against_wig_requirements(integer)
from public, anon, authenticated;
revoke all on function public.evaluate_current_hair_observations(numeric, text, jsonb)
from public, anon;
grant execute on function public.evaluate_current_hair_observations(numeric, text, jsonb)
to authenticated;
revoke all on function public.latest_ai_screening_id_for_user(integer)
from public, anon, authenticated;
revoke all on function public.sync_ai_screening_current_decision()
from public;
revoke all on function public.refresh_ai_screening_decisions_after_requirement_change()
from public;
revoke all on function public.guard_ai_screening_submission_link()
from public;
revoke all on function public.link_hair_submission_existing_ai_screening()
from public;
revoke all on function public.get_current_hair_eligibility(integer)
from public, anon;
grant execute on function public.get_current_hair_eligibility(integer)
to authenticated;
revoke all on function public.guard_hair_submission_eligible_screening()
from public;
revoke all on function public.start_event_hair_donation_after_check_in()
from public;
revoke all on function public.guard_event_attendee_access_and_eligibility()
from public;

comment on function public.get_current_hair_eligibility(integer)
is 'Returns current derived eligibility for an owned AI screening using the newest wig_requirements row. Stored AI_Screenings.Decision is ignored.';

comment on function public.evaluate_current_hair_observations(numeric, text, jsonb)
is 'Evaluates unsaved AI observations against current wig_requirements for authenticated Hair Check presentation; donation creation re-evaluates the stored screening.';

commit;

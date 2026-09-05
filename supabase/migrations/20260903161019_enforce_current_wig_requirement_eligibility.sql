begin;

-- wig_requirements is a singleton in the current schema. Its newest row is
-- therefore the current configuration; there is no separate active column.
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
  minimum_length_cm numeric;
  observed boolean;
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
      'eligible', false,
      'configuration_error', true,
      'reasons', jsonb_build_array('Donation requirements are currently unavailable. Please try again later or contact the organization.')
    );
  end if;

  minimum_length_cm := requirement."Minimum_Hair_Length" * 2.54;
  if minimum_length_cm is not null
     and (p_estimated_length_cm is null or p_estimated_length_cm < minimum_length_cm) then
    reasons := array_append(reasons,
      case when p_estimated_length_cm is null
        then format('Hair length could not be measured against the configured minimum of %s inches.', requirement."Minimum_Hair_Length")
        else format('Estimated hair length is %s cm, below the configured minimum of %s inches.', round(p_estimated_length_cm, 1), requirement."Minimum_Hair_Length")
      end
    );
  end if;

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
      observed := case
        when jsonb_typeof(coalesce(p_analysis_result, '{}'::jsonb) -> split_part(configured_rule, '|', 2)) = 'boolean'
          then (p_analysis_result ->> split_part(configured_rule, '|', 2))::boolean
        else null
      end;
      if observed is true then
        reasons := array_append(reasons, format('The current donation requirements do not allow %s hair.', split_part(configured_rule, '|', 3)));
      elsif observed is null then
        reasons := array_append(reasons, format('The Hair Check did not record whether the hair is %s. Complete a new Hair Check using the current requirements.', split_part(configured_rule, '|', 3)));
      end if;
    end if;
  end loop;

  configured_textures := nullif(btrim(coalesce(requirement."Hair_Texture_Status", '')), '');
  if configured_textures is not null
     and public.normalize_flow_key(configured_textures) not in ('any', 'all', 'anyhairtexture', 'allhairtypes', 'none', 'norestriction', 'notrestricted')
     and not exists (
       select 1
       from regexp_split_to_table(configured_textures, '[,;/|\n]+') allowed(texture)
       where public.normalize_flow_key(allowed.texture) = public.normalize_flow_key(coalesce(p_detected_texture, ''))
     ) then
    reasons := array_append(reasons, format(
      'Detected hair texture (%s) does not match the configured allowed texture (%s).',
      coalesce(nullif(btrim(p_detected_texture), ''), 'unknown'),
      configured_textures
    ));
  end if;

  return jsonb_build_object(
    'eligible', cardinality(reasons) = 0,
    'configuration_error', false,
    'reasons', to_jsonb(reasons),
    'wig_requirement_id', requirement."Wig_Requirement_ID",
    'wig_requirement_updated_at', requirement."Updated_At",
    'minimum_hair_length_inches', requirement."Minimum_Hair_Length"
  );
end;
$$;

create or replace function public.evaluate_ai_screening_against_wig_requirements(p_ai_screening_id integer)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.evaluate_hair_observations_against_wig_requirements(
    ai."Estimated_Length",
    ai."Detected_Texture",
    coalesce(ai."Analysis_Result", '{}'::jsonb)
  )
  from public."AI_Screenings" ai
  where ai."AI_Screening_ID" = p_ai_screening_id;
$$;

create or replace function public.enforce_ai_screening_wig_requirements()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  evaluation jsonb;
begin
  evaluation := public.evaluate_hair_observations_against_wig_requirements(
    new."Estimated_Length", new."Detected_Texture", coalesce(new."Analysis_Result", '{}'::jsonb)
  );
  if coalesce((evaluation ->> 'configuration_error')::boolean, false) then
    raise exception 'Donation requirements are currently unavailable. Please try again later or contact the organization.';
  end if;

  new."Decision" := case when (evaluation ->> 'eligible')::boolean
    then 'Eligible for hair donation'
    else 'Not eligible for donation yet'
  end;
  new."Improvement_Tracking_Status" := case when (evaluation ->> 'eligible')::boolean
    then 'Ready for donation'
    else 'Not eligible for donation yet'
  end;
  new."Analysis_Result" := coalesce(new."Analysis_Result", '{}'::jsonb)
    || jsonb_build_object(
      'eligibility_reasons', evaluation -> 'reasons',
      'eligibility_evaluation', evaluation
        || jsonb_build_object('evaluated_at', timezone('Asia/Manila', now())),
      'wig_requirement_id', evaluation -> 'wig_requirement_id',
      'wig_requirement_updated_at', evaluation -> 'wig_requirement_updated_at'
    );
  return new;
end;
$$;

drop trigger if exists trg_enforce_ai_screening_wig_requirements on public."AI_Screenings";
create trigger trg_enforce_ai_screening_wig_requirements
before insert or update of "Estimated_Length", "Detected_Texture", "Analysis_Result", "Decision", "Improvement_Tracking_Status"
on public."AI_Screenings"
for each row execute function public.enforce_ai_screening_wig_requirements();

create or replace function public.guard_hair_submission_eligible_screening()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  evaluation jsonb;
begin
  if new."AI_Screening_ID" is null then
    raise exception 'An eligible AI screening is required before starting a hair donation.';
  end if;

  if not exists (
    select 1 from public."AI_Screenings" ai
    where ai."AI_Screening_ID" = new."AI_Screening_ID"
      and ai."User_ID" = new."User_ID"
      and ai."AI_Screening_ID" = (
        select latest_ai."AI_Screening_ID"
        from public."AI_Screenings" latest_ai
        where latest_ai."User_ID" = new."User_ID"
          and nullif(btrim(coalesce(latest_ai."Decision", '')), '') is not null
        order by latest_ai."Created_At" desc nulls last, latest_ai."AI_Screening_ID" desc
        limit 1
      )
  ) then
    raise exception 'The donor''s latest completed AI screening is required before starting a donation.';
  end if;

  evaluation := public.evaluate_ai_screening_against_wig_requirements(new."AI_Screening_ID");
  if evaluation is null
     or coalesce((evaluation ->> 'configuration_error')::boolean, false)
     or not coalesce((evaluation ->> 'eligible')::boolean, false) then
    raise exception 'The donor''s latest AI screening does not satisfy the current wig requirements: %',
      coalesce(evaluation ->> 'reasons', 'requirements unavailable');
  end if;
  return new;
end;
$$;

-- Event check-in already creates the master submission. Select only a latest
-- screening that still passes the current requirements.
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
  if new."User_ID" is null or new."Event_Request_ID" is null or new."RSVP_Scanned_At" is null
     or public.normalize_flow_key(coalesce(new."Registration_Status", '')) <> 'registered'
     or public.normalize_flow_key(coalesce(new."Attendance_Status", '')) <> 'present'
     or public.normalize_flow_key(coalesce(new."Attendee_Type", 'Donor')) <> 'donor' then
    return new;
  end if;

  select ai."AI_Screening_ID" into screening_id
  from public."AI_Screenings" ai
  where ai."User_ID" = new."User_ID"
    and nullif(btrim(coalesce(ai."Decision", '')), '') is not null
  order by ai."Created_At" desc nulls last, ai."AI_Screening_ID" desc
  limit 1;
  evaluation := public.evaluate_ai_screening_against_wig_requirements(screening_id);
  if screening_id is null or evaluation is null
     or coalesce((evaluation ->> 'configuration_error')::boolean, false)
     or not coalesce((evaluation ->> 'eligible')::boolean, false) then
    raise exception 'This donor''s latest AI hair screening does not satisfy the current wig requirements.';
  end if;

  select hs."Submission_ID" into existing_submission_id
  from public."Hair_Submissions" hs
  where hs."Event_Attendee_ID" = new."Event_Attendee_ID"
  order by hs."Created_At" desc nulls last, hs."Submission_ID" desc limit 1;

  if existing_submission_id is null then
    insert into public."Hair_Submissions" (
      "User_ID", "AI_Screening_ID", "Event_Request_ID", "Event_Attendee_ID", "From_Event", "Status"
    ) values (
      new."User_ID", screening_id, new."Event_Request_ID", new."Event_Attendee_ID", true, 'Pending'
    );
  else
    update public."Hair_Submissions"
    set "AI_Screening_ID" = screening_id,
        "User_ID" = new."User_ID",
        "Event_Request_ID" = new."Event_Request_ID",
        "From_Event" = true,
        "Status" = case when public.normalize_flow_key(coalesce("Status", '')) = 'cancelled' then 'Pending' else "Status" end,
        "Updated_At" = now()
    where "Submission_ID" = existing_submission_id;
  end if;
  return new;
end;
$$;

revoke all on function public.evaluate_hair_observations_against_wig_requirements(numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public.evaluate_ai_screening_against_wig_requirements(integer) from public, anon, authenticated;
revoke all on function public.enforce_ai_screening_wig_requirements() from public;
revoke all on function public.guard_hair_submission_eligible_screening() from public;
revoke all on function public.start_event_hair_donation_after_check_in() from public;

comment on function public.evaluate_hair_observations_against_wig_requirements(numeric, text, jsonb)
is 'Deterministically evaluates observed hair facts using the newest singleton wig_requirements row; no care or image-quality heuristics are qualification rules.';

commit;

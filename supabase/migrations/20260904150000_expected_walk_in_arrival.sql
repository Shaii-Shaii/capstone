-- Deployable follow-up for projects where
-- 20260904113000_atomic_salon_logistics_scheduling.sql is already applied.
-- All statements are idempotent so fresh and linked databases converge on
-- the same expected-arrival behavior.
begin;

-- Keep one partial unique index for the one-appointment-per-submission rule.
-- uq_salon_donation_appointments_submission is the canonical index created by
-- the salon scheduling migration.
drop index if exists public.uq_salon_appointments_hair_submission;

-- The existing trigger remains the only generator. Tighten its update behavior
-- so a persisted independent-donation waybill cannot be replaced later.
create or replace function public.assign_hair_submission_waybill_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(old."From_Event", false) = false
     and old."Waybill_Code" is not null
     and coalesce(new."From_Event", false) = false
     and new."Waybill_Code" is distinct from old."Waybill_Code" then
    raise exception 'An assigned logistics waybill cannot be changed or regenerated.'
      using errcode = '23514';
  end if;

  if coalesce(new."From_Event", false) = false then
    if new."Waybill_Code" is null
       or btrim(new."Waybill_Code") !~ '^WB[A-Z0-9]{6}$' then
      new."Waybill_Code" := public.generate_unique_hair_submission_waybill_code();
    else
      new."Waybill_Code" := upper(btrim(new."Waybill_Code"));
    end if;
  else
    new."Waybill_Code" := null;
  end if;

  return new;
end;
$$;

-- New donations use the donor-facing method names. Keep the previous values in
-- the constraint so historical Courier, Pickup, and Salon Dropoff rows remain
-- readable and maintainable.
alter table public."Hair_Submission_Logistics"
drop constraint if exists hair_submission_logistics_type_check;

alter table public."Hair_Submission_Logistics"
add constraint hair_submission_logistics_type_check
check (
  "Logistics_Type" in (
    'Courier',
    'Pickup',
    'Salon Dropoff',
    'Walk-in Drop-off',
    'Ship by Courier'
  )
);

create or replace function public.guard_independent_hair_submission_logistics()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_type_key text := public.normalize_flow_key(coalesce(new."Logistics_Type", ''));
  old_type_key text := case
    when tg_op = 'UPDATE' then public.normalize_flow_key(coalesce(old."Logistics_Type", ''))
    else ''
  end;
begin
  if not exists (
    select 1
    from public."Hair_Submissions" submission
    where submission."Submission_ID" = new."Submission_ID"
      and submission."From_Event" = false
  ) then
    raise exception 'Hair logistics requires an existing independent Hair_Submissions record.';
  end if;

  -- Pickup survives only as a historical value. An unchanged historical row
  -- can still receive lifecycle/status updates, but no caller can create or
  -- convert a donation into Pickup.
  if requested_type_key in ('pickup', 'pickuprequest') then
    if tg_op = 'INSERT' or old_type_key not in ('pickup', 'pickuprequest') then
      raise exception 'Request Pickup is no longer available. Choose Walk-in Drop-off or Ship by Courier.'
        using errcode = '23514';
    end if;
    new."Logistics_Type" := old."Logistics_Type";
  elsif requested_type_key in ('walkindropoff', 'salondropoff', 'onsitedelivery', 'walkin', 'dropoff') then
    new."Logistics_Type" := 'Walk-in Drop-off';
  elsif requested_type_key in ('shipbycourier', 'courier', 'shipping', 'independentshipping') then
    new."Logistics_Type" := 'Ship by Courier';
  else
    raise exception 'Logistics_Type must be Walk-in Drop-off or Ship by Courier.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and old_type_key in ('walkindropoff', 'salondropoff', 'onsitedelivery', 'walkin', 'dropoff')
     and new."Logistics_Type" <> 'Walk-in Drop-off'
     and exists (
       select 1
       from public."Salon_Donation_Appointments" appointment
       where appointment."Hair_Submission_ID" = new."Submission_ID"
         and appointment."Status" in ('Confirmed', 'Rescheduled', 'Checked In')
     ) then
    raise exception 'Cancel or complete the active salon appointment before changing the logistics type.';
  end if;

  if new."Logistics_Type" = 'Walk-in Drop-off' then
    new."Pickup_Scheduled_At" := null;
    new."Pickup_Approved_At" := null;
    new."Courier_Name" := null;
    new."Tracking_Number" := null;
    if new."Shipment_Status" not in ('Received', 'Cancelled') then
      new."Shipment_Status" := null;
    end if;
  elsif new."Logistics_Type" = 'Ship by Courier' then
    new."Pickup_Scheduled_At" := null;
    new."Pickup_Approved_At" := null;
  end if;

  new."Updated_At" := timezone('Asia/Manila', now());
  if new."Updated_By" is null then
    new."Updated_By" := public.current_app_user_id();
  end if;
  return new;
end;
$$;

-- Walk-in records store an approximate expected arrival, not a reserved time
-- interval. Historical rows may retain an end time; new rows leave it null.
alter table public."Salon_Donation_Appointments"
alter column "Appointment_End_At" drop not null;

comment on column public."Salon_Donation_Appointments"."Appointment_Start_At"
is 'Expected walk-in arrival date and approximate time in Asia/Manila.';

comment on column public."Salon_Donation_Appointments"."Appointment_End_At"
is 'Legacy appointment interval end. Null for new expected walk-in arrivals.';

comment on table public."Salon_Donation_Appointments"
is 'Walk-in expected-arrival and lifecycle records. Appointment_Start_At is approximate; new records do not reserve slots or require an end time.';

-- Return open dates and their effective receiving hours. This function does
-- not generate slots and does not read appointment duration, buffer, capacity,
-- or existing appointments.
drop function if exists public.get_available_salon_donation_slots(integer);

create or replace function public.get_available_walk_in_dates()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id integer;
  manila_now timestamp := timezone('Asia/Manila', now());
  manila_today date := manila_now::date;
  maximum_configured_days integer;
  schedule_date date;
  regular_hours public."Salon_Operating_Hours"%rowtype;
  schedule_override public."Salon_Schedule_Overrides"%rowtype;
  has_override boolean;
  effective_opening time;
  effective_closing time;
  effective_break_start time;
  effective_break_end time;
  available_dates jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to view salon schedules.'
      using errcode = '28000';
  end if;

  current_user_id := public.current_app_user_id();
  if current_user_id is null then
    raise exception 'Your signed-in account is not linked to an application user.'
      using errcode = '28000';
  end if;

  select max(hours."Maximum_Booking_Days")
  into maximum_configured_days
  from public."Salon_Operating_Hours" hours;

  if maximum_configured_days is null then
    return available_dates;
  end if;

  for schedule_date in
    select generated_date::date
    from generate_series(
      manila_today::timestamp,
      (manila_today + maximum_configured_days)::timestamp,
      interval '1 day'
    ) generated_date
  loop
    select hours.*
    into regular_hours
    from public."Salon_Operating_Hours" hours
    where hours."Day_Group" = case
      when extract(isodow from schedule_date) in (6, 7) then 'Weekend'
      else 'Weekday'
    end
    limit 1;

    if not found
       or schedule_date < manila_today + regular_hours."Minimum_Booking_Notice_Days"
       or schedule_date > manila_today + regular_hours."Maximum_Booking_Days" then
      continue;
    end if;

    select override_row.*
    into schedule_override
    from public."Salon_Schedule_Overrides" override_row
    where override_row."Override_Date" = schedule_date
    order by override_row."Updated_At" desc,
             override_row."Schedule_Override_ID" desc
    limit 1;
    has_override := found;

    if (has_override and schedule_override."Is_Closed")
       or (not has_override and not regular_hours."Is_Open") then
      continue;
    end if;

    effective_opening := case when has_override
      then coalesce(schedule_override."Opening_Time", regular_hours."Opening_Time")
      else regular_hours."Opening_Time" end;
    effective_closing := case when has_override
      then coalesce(schedule_override."Closing_Time", regular_hours."Closing_Time")
      else regular_hours."Closing_Time" end;
    effective_break_start := case when has_override
      then coalesce(schedule_override."Break_Start_Time", regular_hours."Break_Start_Time")
      else regular_hours."Break_Start_Time" end;
    effective_break_end := case when has_override
      then coalesce(schedule_override."Break_End_Time", regular_hours."Break_End_Time")
      else regular_hours."Break_End_Time" end;
    if effective_opening is null
       or effective_closing is null
       or effective_opening >= effective_closing then
      continue;
    end if;

    -- A same-day date is useful only while a future arrival can still fall
    -- inside that day's receiving hours.
    if schedule_date = manila_today
       and effective_closing <= manila_now::time then
      continue;
    end if;

    available_dates := available_dates || jsonb_build_array(jsonb_build_object(
      'value', to_char(schedule_date, 'YYYY-MM-DD'),
      'label', case
        when schedule_date = manila_today then 'Today'
        else to_char(schedule_date, 'Dy, Mon FMDD')
      end,
      'full_label', to_char(schedule_date, 'FMDay, FMMonth FMDD, YYYY'),
      'opening_time', to_char(effective_opening, 'HH24:MI'),
      'closing_time', to_char(effective_closing, 'HH24:MI'),
      'break_start_time', case when effective_break_start is null then null else to_char(effective_break_start, 'HH24:MI') end,
      'break_end_time', case when effective_break_end is null then null else to_char(effective_break_end, 'HH24:MI') end,
      'status', 'OPEN'
    ));
  end loop;

  return available_dates;
end;
$$;

-- Expected arrival validation is schedule-aware but deliberately has no slot,
-- duration, buffer, end-time, grace-period, or capacity behavior.
create or replace function public.guard_salon_donation_appointment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  regular_hours public."Salon_Operating_Hours"%rowtype;
  schedule_override public."Salon_Schedule_Overrides"%rowtype;
  has_override boolean := false;
  opening_time time;
  closing_time time;
  break_start time;
  break_end time;
  minimum_notice_days integer;
  maximum_booking_days integer;
  appointment_date date;
  appointment_start_time time;
  current_manila timestamp := timezone('Asia/Manila', now());
  parent_status text;
begin
  if not exists (
    select 1
    from public."Hair_Submissions" submission
    join public."Hair_Submission_Logistics" logistics
      on logistics."Submission_ID" = submission."Submission_ID"
    where submission."Submission_ID" = new."Hair_Submission_ID"
      and submission."User_ID" = new."User_ID"
      and submission."From_Event" = false
      and logistics."Logistics_Type" in ('Salon Dropoff', 'Walk-in Drop-off')
  ) then
    raise exception 'Expected walk-in arrivals require the donor''s existing independent Walk-in Drop-off donation.';
  end if;

  select submission."Status"
  into parent_status
  from public."Hair_Submissions" submission
  where submission."Submission_ID" = new."Hair_Submission_ID";

  if tg_op = 'UPDATE'
     and (
       old."Status" in ('No Show', 'Cancelled')
       or public.normalize_flow_key(coalesce(parent_status, '')) = 'cancelled'
     )
     and (
       new."Status" is distinct from old."Status"
       or new."Appointment_Start_At" is distinct from old."Appointment_Start_At"
     ) then
    raise exception 'A cancelled or No Show walk-in donation cannot be reopened or rescheduled.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT'
     or old."Appointment_Start_At" is distinct from new."Appointment_Start_At" then
    appointment_date := new."Appointment_Start_At"::date;
    appointment_start_time := new."Appointment_Start_At"::time;

    select hours.*
    into regular_hours
    from public."Salon_Operating_Hours" hours
    where hours."Day_Group" = case
      when extract(isodow from appointment_date) in (6, 7) then 'Weekend'
      else 'Weekday'
    end
    limit 1;

    if not found then
      raise exception 'Salon operating hours are not configured for the selected date.';
    end if;

    select override_row.*
    into schedule_override
    from public."Salon_Schedule_Overrides" override_row
    where override_row."Override_Date" = appointment_date
    order by override_row."Updated_At" desc,
             override_row."Schedule_Override_ID" desc
    limit 1;
    has_override := found;

    if has_override and schedule_override."Is_Closed" then
      raise exception 'The salon is closed on the selected date.';
    end if;
    if not has_override and not regular_hours."Is_Open" then
      raise exception 'The salon is closed on the selected date.';
    end if;

    opening_time := case when has_override
      then coalesce(schedule_override."Opening_Time", regular_hours."Opening_Time")
      else regular_hours."Opening_Time" end;
    closing_time := case when has_override
      then coalesce(schedule_override."Closing_Time", regular_hours."Closing_Time")
      else regular_hours."Closing_Time" end;
    break_start := case when has_override
      then coalesce(schedule_override."Break_Start_Time", regular_hours."Break_Start_Time")
      else regular_hours."Break_Start_Time" end;
    break_end := case when has_override
      then coalesce(schedule_override."Break_End_Time", regular_hours."Break_End_Time")
      else regular_hours."Break_End_Time" end;
    minimum_notice_days := regular_hours."Minimum_Booking_Notice_Days";
    maximum_booking_days := regular_hours."Maximum_Booking_Days";

    if opening_time is null
       or closing_time is null
       or opening_time >= closing_time then
      raise exception 'Salon availability is incomplete for the selected date.';
    end if;

    if new."Appointment_Start_At" <= current_manila then
      raise exception 'The expected walk-in arrival must be in the future.';
    end if;

    if appointment_date < current_manila::date + minimum_notice_days
       or appointment_date > current_manila::date + maximum_booking_days then
      raise exception 'The selected date is outside the allowed booking window.';
    end if;

    if appointment_start_time < opening_time
       or appointment_start_time > closing_time then
      raise exception 'Expected arrival must be within the salon receiving hours.';
    end if;

    if break_start is not null and break_end is not null
       and appointment_start_time >= break_start
       and appointment_start_time < break_end then
      raise exception 'Expected arrival cannot be during the salon break.';
    end if;
    new."Appointment_End_At" := null;
  end if;

  if tg_op = 'UPDATE'
     and new."Status" = 'Checked In'
     and old."Status" is distinct from new."Status" then
    if auth.uid() is not null and not public.current_app_user_is_staff() then
      raise exception 'Only authorized staff can check in an expected walk-in.'
        using errcode = '42501';
    end if;
    if old."Status" not in ('Confirmed', 'Rescheduled') then
      raise exception 'Only an active expected walk-in can be checked in.';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and new."Status" = 'Completed'
     and old."Status" is distinct from new."Status" then
    if auth.uid() is not null and not public.current_app_user_is_staff() then
      raise exception 'Only authorized staff can complete a walk-in receipt.'
        using errcode = '42501';
    end if;
    if old."Status" <> 'Checked In' then
      raise exception 'Check the walk-in donor in before completing receipt.';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and new."Status" = 'Cancelled'
     and old."Status" is distinct from new."Status"
     and (
       old."Status" not in ('Confirmed', 'Rescheduled')
       or old."Checked_In_At" is not null
     ) then
    raise exception 'Only a walk-in that has not arrived may be cancelled.';
  end if;

  if tg_op = 'UPDATE'
     and new."Status" = 'No Show'
     and old."Status" is distinct from new."Status" then
    if not public.current_app_user_is_staff() then
      raise exception 'Only authorized staff can mark an expected walk-in as No Show.'
        using errcode = '42501';
    end if;
    if old."Status" not in ('Confirmed', 'Rescheduled')
       or old."Checked_In_At" is not null then
      raise exception 'Only an unchecked active walk-in can be marked No Show.';
    end if;

    appointment_date := old."Appointment_Start_At"::date;
    select hours.*
    into regular_hours
    from public."Salon_Operating_Hours" hours
    where hours."Day_Group" = case
      when extract(isodow from appointment_date) in (6, 7) then 'Weekend'
      else 'Weekday'
    end
    limit 1;

    select override_row.*
    into schedule_override
    from public."Salon_Schedule_Overrides" override_row
    where override_row."Override_Date" = appointment_date
    order by override_row."Updated_At" desc,
             override_row."Schedule_Override_ID" desc
    limit 1;
    has_override := found;
    closing_time := case
      when has_override and not schedule_override."Is_Closed"
        then coalesce(schedule_override."Closing_Time", regular_hours."Closing_Time")
      else regular_hours."Closing_Time"
    end;

    if appointment_date > current_manila::date
       or (
         appointment_date = current_manila::date
         and (closing_time is null or current_manila::time <= closing_time)
       ) then
      raise exception 'No Show can only be confirmed after the expected receiving day has ended.';
    end if;

    new."Cancellation_Reason" := coalesce(
      nullif(btrim(new."Cancellation_Reason"), ''),
      'Walk-in donor did not arrive on the expected drop-off date.'
    );
  end if;

  if public.normalize_flow_key(new."Status") = 'checkedin'
     and new."Checked_In_At" is null then
    new."Checked_In_At" := timezone('Asia/Manila', now());
  elsif public.normalize_flow_key(new."Status") = 'completed'
     and new."Completed_At" is null then
    new."Completed_At" := timezone('Asia/Manila', now());
  elsif public.normalize_flow_key(new."Status") = 'cancelled'
     and new."Cancelled_At" is null then
    new."Cancelled_At" := timezone('Asia/Manila', now());
  elsif public.normalize_flow_key(new."Status") = 'noshow'
     and new."Cancelled_At" is null then
    new."Cancelled_At" := timezone('Asia/Manila', now());
  end if;

  new."Updated_At" := timezone('Asia/Manila', now());
  return new;
end;
$$;

drop function if exists public.schedule_salon_logistics_donation(
  timestamp without time zone,
  timestamp without time zone,
  text,
  text,
  text,
  text,
  integer
);

-- Validate and write one expected walk-in arrival in a transaction. Any
-- exception rolls back the submission, reverse AI link, and logistics row.
create or replace function public.schedule_salon_logistics_donation(
  p_expected_arrival_at timestamp without time zone,
  p_contact_name text,
  p_contact_number text,
  p_contact_email text default null,
  p_donor_notes text default null,
  p_hair_submission_id integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id integer;
  screening_id integer;
  evaluation jsonb;
  donor_profile record;
  donor_age integer;
  guardian_consent_id integer;
  consent_legal_document_id integer;
  submission_row public."Hair_Submissions"%rowtype;
  logistics_row public."Hair_Submission_Logistics"%rowtype;
  appointment_row public."Salon_Donation_Appointments"%rowtype;
  is_reschedule boolean := p_hair_submission_id is not null;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to schedule a salon donation.'
      using errcode = '28000';
  end if;

  current_user_id := public.current_app_user_id();
  if current_user_id is null then
    raise exception 'Your signed-in account is not linked to an application user.'
      using errcode = '28000';
  end if;

  if p_expected_arrival_at is null then
    raise exception 'Choose an expected drop-off date and arrival time before continuing.';
  end if;
  if nullif(btrim(p_contact_name), '') is null
     or nullif(btrim(p_contact_number), '') is null then
    raise exception 'Complete your contact name and number before scheduling.';
  end if;

  select details.birthdate,
         details.first_name,
         details.last_name,
         details.contact_number
  into donor_profile
  from public.user_details details
  where details.user_id = current_user_id
  order by details.updated_at desc nulls last
  limit 1;

  if not found
     or donor_profile.birthdate is null
     or nullif(btrim(donor_profile.first_name), '') is null
     or nullif(btrim(donor_profile.last_name), '') is null
     or nullif(btrim(donor_profile.contact_number), '') is null then
    raise exception 'Please complete your donor profile before scheduling a donation.';
  end if;

  donor_age := extract(year from age(
    timezone('Asia/Manila', now())::date,
    donor_profile.birthdate
  ))::integer;

  if donor_age < 18 then
    select consent.guardian_consent_id
    into guardian_consent_id
    from public.guardian_consents consent
    where consent.user_id = current_user_id
      and public.normalize_flow_key(coalesce(consent.consent_status, '')) = 'active'
      and consent.minor_donation_allowed is true
      and consent.ai_image_processing_allowed is true
      and consent.revoked_at is null
    order by consent.consented_at desc nulls last,
             consent.guardian_consent_id desc
    limit 1;

    if guardian_consent_id is null then
      raise exception 'Active guardian consent is required before a minor donor can schedule a donation.';
    end if;

    select document.legal_document_id
    into consent_legal_document_id
    from public.legal_documents document
    where document.is_active is true
      and public.normalize_flow_key(document.document_type) = 'consentforminors'
    order by document.effective_at desc nulls last,
             document.created_at desc nulls last,
             document.legal_document_id desc
    limit 1;
  end if;

  if is_reschedule then
    select submission.*
    into submission_row
    from public."Hair_Submissions" submission
    where submission."Submission_ID" = p_hair_submission_id
      and submission."User_ID" = current_user_id
      and submission."From_Event" = false
    for update;

    if not found then
      raise exception 'The logistics donation could not be found.';
    end if;

    select logistics.*
    into logistics_row
    from public."Hair_Submission_Logistics" logistics
    where logistics."Submission_ID" = submission_row."Submission_ID"
      and logistics."Logistics_Type" in ('Salon Dropoff', 'Walk-in Drop-off')
    for update;

    if not found then
      raise exception 'This donation is not configured for salon drop-off.';
    end if;

    select appointment.*
    into appointment_row
    from public."Salon_Donation_Appointments" appointment
    where appointment."Hair_Submission_ID" = submission_row."Submission_ID"
      and appointment."User_ID" = current_user_id
    for update;

    if not found then
      raise exception 'The expected walk-in arrival could not be found.';
    end if;
    if appointment_row."Status" not in ('Confirmed', 'Rescheduled') then
      raise exception 'This expected walk-in arrival can no longer be changed.';
    end if;

    update public."Salon_Donation_Appointments"
    set "Appointment_Start_At" = p_expected_arrival_at,
        "Appointment_End_At" = null,
        "Status" = 'Rescheduled',
        "Contact_Name" = btrim(p_contact_name),
        "Contact_Email" = nullif(btrim(p_contact_email), ''),
        "Contact_Number" = btrim(p_contact_number),
        "Donor_Notes" = nullif(btrim(p_donor_notes), ''),
        "Is_Minor" = donor_age < 18,
        "Guardian_Consent_ID" = guardian_consent_id,
        "Consent_Legal_Document_ID" = consent_legal_document_id
    where "Appointment_ID" = appointment_row."Appointment_ID"
    returning * into appointment_row;
  else
    screening_id := public.latest_ai_screening_id_for_user(current_user_id);
    if screening_id is null then
      raise exception 'Hair Check Required. Complete a Hair Check before starting a logistics donation.';
    end if;

    select screening."AI_Screening_ID"
    into screening_id
    from public."AI_Screenings" screening
    where screening."AI_Screening_ID" = screening_id
      and screening."User_ID" = current_user_id
      and screening."Submission_ID" is null
    for update;

    if not found then
      raise exception 'The selected Hair Check is no longer available for a new donation.';
    end if;

    evaluation := public.evaluate_ai_screening_against_wig_requirements(screening_id);
    if evaluation is null then
      raise exception 'Your latest Hair Check could not be evaluated.';
    elsif coalesce((evaluation ->> 'configuration_error')::boolean, false) then
      raise exception 'Donation requirements are currently unavailable. Please try again later.';
    elsif not coalesce((evaluation ->> 'eligible')::boolean, false) then
      raise exception 'Your latest Hair Check does not satisfy the current wig requirements: %',
        coalesce(evaluation ->> 'reason', evaluation ->> 'reasons', 'requirements not satisfied');
    elsif not coalesce((public.get_current_hair_eligibility(screening_id) ->> 'available_for_new_donation')::boolean, false) then
      raise exception 'Your latest Hair Check is already linked to another donation.';
    end if;

    insert into public."Hair_Submissions" (
      "User_ID",
      "AI_Screening_ID",
      "Event_Request_ID",
      "Event_Attendee_ID",
      "From_Event",
      "Donor_Notes",
      "Status"
    ) values (
      current_user_id,
      screening_id,
      null,
      null,
      false,
      'Salon drop-off scheduled from the mobile Donations module.',
      'Pending'
    )
    returning * into submission_row;

    if submission_row."Waybill_Code" is null
       or submission_row."Waybill_Code" !~ '^WB[A-Z0-9]{6}$' then
      raise exception 'The logistics donation waybill could not be generated.';
    end if;

    if not exists (
      select 1
      from public."AI_Screenings" linked_screening
      where linked_screening."AI_Screening_ID" = screening_id
        and linked_screening."User_ID" = current_user_id
        and linked_screening."Submission_ID" = submission_row."Submission_ID"
    ) then
      raise exception 'The existing Hair Check could not be linked to the new donation.';
    end if;

    insert into public."Hair_Submission_Logistics" (
      "Submission_ID",
      "Logistics_Type",
      "Shipment_Status",
      "Notes",
      "Updated_By"
    ) values (
      submission_row."Submission_ID",
      'Walk-in Drop-off',
      null,
      'The expected-arrival record is the source of truth for the approximate drop-off date and time.',
      current_user_id
    )
    returning * into logistics_row;

    insert into public."Salon_Donation_Appointments" (
      "User_ID",
      "Hair_Submission_ID",
      "Appointment_Start_At",
      "Appointment_End_At",
      "Status",
      "Contact_Name",
      "Contact_Email",
      "Contact_Number",
      "Donor_Notes",
      "Booking_Source",
      "Is_Minor",
      "Guardian_Consent_ID",
      "Consent_Legal_Document_ID"
    ) values (
      current_user_id,
      submission_row."Submission_ID",
      p_expected_arrival_at,
      null,
      'Confirmed',
      btrim(p_contact_name),
      nullif(btrim(p_contact_email), ''),
      btrim(p_contact_number),
      nullif(btrim(p_donor_notes), ''),
      'Mobile',
      donor_age < 18,
      guardian_consent_id,
      consent_legal_document_id
    )
    returning * into appointment_row;
  end if;

  return jsonb_build_object(
    'delivery_method', 'walk_in',
    'rescheduled', is_reschedule,
    'submission', jsonb_build_object(
      'submission_id', submission_row."Submission_ID",
      'user_id', submission_row."User_ID",
      'ai_screening_id', submission_row."AI_Screening_ID",
      'event_request_id', submission_row."Event_Request_ID",
      'event_attendee_id', submission_row."Event_Attendee_ID",
      'from_event', submission_row."From_Event",
      'waybill_code', submission_row."Waybill_Code",
      'donor_notes', submission_row."Donor_Notes",
      'status', submission_row."Status",
      'created_at', submission_row."Created_At",
      'updated_at', submission_row."Updated_At"
    ),
    'logistics', jsonb_build_object(
      'submission_logistics_id', logistics_row."Submission_Logistics_ID",
      'submission_id', logistics_row."Submission_ID",
      'logistics_type', logistics_row."Logistics_Type",
      'shipment_status', logistics_row."Shipment_Status",
      'received_by', logistics_row."Received_By",
      'received_at', logistics_row."Received_At",
      'notes', logistics_row."Notes",
      'created_at', logistics_row."Created_At",
      'updated_at', logistics_row."Updated_At"
    ),
    'appointment', jsonb_build_object(
      'appointment_id', appointment_row."Appointment_ID",
      'user_id', appointment_row."User_ID",
      'submission_id', appointment_row."Hair_Submission_ID",
      'appointment_start_at', appointment_row."Appointment_Start_At",
      'appointment_end_at', appointment_row."Appointment_End_At",
      'status', appointment_row."Status",
      'booking_source', appointment_row."Booking_Source",
      'checked_in_at', appointment_row."Checked_In_At",
      'completed_at', appointment_row."Completed_At",
      'cancelled_at', appointment_row."Cancelled_At",
      'created_at', appointment_row."Created_At",
      'updated_at', appointment_row."Updated_At"
    )
  );
end;
$$;

-- Courier confirmation is intentionally separate from salon scheduling. It
-- rechecks the current Hair Check and creates the submission, immutable
-- waybill, reverse AI link, and one logistics row in this single transaction.
create or replace function public.confirm_courier_logistics_donation(
  p_courier_name text default null,
  p_tracking_number text default null,
  p_donor_notes text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id integer;
  screening_id integer;
  evaluation jsonb;
  donor_profile record;
  donor_age integer;
  guardian_consent_id integer;
  submission_row public."Hair_Submissions"%rowtype;
  logistics_row public."Hair_Submission_Logistics"%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to confirm a courier donation.'
      using errcode = '28000';
  end if;

  current_user_id := public.current_app_user_id();
  if current_user_id is null then
    raise exception 'Your signed-in account is not linked to an application user.'
      using errcode = '28000';
  end if;

  select details.birthdate,
         details.first_name,
         details.last_name,
         details.contact_number
  into donor_profile
  from public.user_details details
  where details.user_id = current_user_id
  order by details.updated_at desc nulls last
  limit 1;

  if not found
     or donor_profile.birthdate is null
     or nullif(btrim(donor_profile.first_name), '') is null
     or nullif(btrim(donor_profile.last_name), '') is null
     or nullif(btrim(donor_profile.contact_number), '') is null then
    raise exception 'Please complete your donor profile before confirming a donation.';
  end if;

  donor_age := extract(year from age(
    timezone('Asia/Manila', now())::date,
    donor_profile.birthdate
  ))::integer;

  if donor_age < 18 then
    select consent.guardian_consent_id
    into guardian_consent_id
    from public.guardian_consents consent
    where consent.user_id = current_user_id
      and public.normalize_flow_key(coalesce(consent.consent_status, '')) = 'active'
      and consent.minor_donation_allowed is true
      and consent.ai_image_processing_allowed is true
      and consent.revoked_at is null
    order by consent.consented_at desc nulls last,
             consent.guardian_consent_id desc
    limit 1;

    if guardian_consent_id is null then
      raise exception 'Active guardian consent is required before a minor donor can confirm a donation.';
    end if;
  end if;

  screening_id := public.latest_ai_screening_id_for_user(current_user_id);
  if screening_id is null then
    raise exception 'Hair Check Required. Complete a Hair Check before starting a logistics donation.';
  end if;

  select screening."AI_Screening_ID"
  into screening_id
  from public."AI_Screenings" screening
  where screening."AI_Screening_ID" = screening_id
    and screening."User_ID" = current_user_id
    and screening."Submission_ID" is null
  for update;

  if not found then
    raise exception 'The selected Hair Check is no longer available for a new donation.';
  end if;

  evaluation := public.evaluate_ai_screening_against_wig_requirements(screening_id);
  if evaluation is null then
    raise exception 'Your latest Hair Check could not be evaluated.';
  elsif coalesce((evaluation ->> 'configuration_error')::boolean, false) then
    raise exception 'Donation requirements are currently unavailable. Please try again later.';
  elsif not coalesce((evaluation ->> 'eligible')::boolean, false) then
    raise exception 'Your latest Hair Check does not satisfy the current wig requirements: %',
      coalesce(evaluation ->> 'reason', evaluation ->> 'reasons', 'requirements not satisfied');
  elsif not coalesce((public.get_current_hair_eligibility(screening_id) ->> 'available_for_new_donation')::boolean, false) then
    raise exception 'Your latest Hair Check is already linked to another donation.';
  end if;

  insert into public."Hair_Submissions" (
    "User_ID",
    "AI_Screening_ID",
    "Event_Request_ID",
    "Event_Attendee_ID",
    "From_Event",
    "Donor_Notes",
    "Status"
  ) values (
    current_user_id,
    screening_id,
    null,
    null,
    false,
    coalesce(nullif(btrim(p_donor_notes), ''), 'Courier donation confirmed from the mobile Donations module.'),
    'Pending'
  )
  returning * into submission_row;

  if submission_row."Waybill_Code" is null
     or submission_row."Waybill_Code" !~ '^WB[A-Z0-9]{6}$' then
    raise exception 'The logistics donation waybill could not be generated.';
  end if;

  if not exists (
    select 1
    from public."AI_Screenings" linked_screening
    where linked_screening."AI_Screening_ID" = screening_id
      and linked_screening."User_ID" = current_user_id
      and linked_screening."Submission_ID" = submission_row."Submission_ID"
  ) then
    raise exception 'The existing Hair Check could not be linked to the new donation.';
  end if;

  insert into public."Hair_Submission_Logistics" (
    "Submission_ID",
    "Logistics_Type",
    "Shipment_Status",
    "Courier_Name",
    "Tracking_Number",
    "Notes",
    "Updated_By"
  ) values (
    submission_row."Submission_ID",
    'Ship by Courier',
    'Pending',
    nullif(btrim(p_courier_name), ''),
    nullif(btrim(p_tracking_number), ''),
    'Courier tracking can be added to this logistics record after the parcel is shipped.',
    current_user_id
  )
  returning * into logistics_row;

  return jsonb_build_object(
    'delivery_method', 'courier',
    'rescheduled', false,
    'submission', jsonb_build_object(
      'submission_id', submission_row."Submission_ID",
      'user_id', submission_row."User_ID",
      'ai_screening_id', submission_row."AI_Screening_ID",
      'event_request_id', submission_row."Event_Request_ID",
      'event_attendee_id', submission_row."Event_Attendee_ID",
      'from_event', submission_row."From_Event",
      'waybill_code', submission_row."Waybill_Code",
      'donor_notes', submission_row."Donor_Notes",
      'status', submission_row."Status",
      'created_at', submission_row."Created_At",
      'updated_at', submission_row."Updated_At"
    ),
    'logistics', jsonb_build_object(
      'submission_logistics_id', logistics_row."Submission_Logistics_ID",
      'submission_id', logistics_row."Submission_ID",
      'logistics_type', logistics_row."Logistics_Type",
      'shipment_status', logistics_row."Shipment_Status",
      'courier_name', logistics_row."Courier_Name",
      'tracking_number', logistics_row."Tracking_Number",
      'received_by', logistics_row."Received_By",
      'received_at', logistics_row."Received_At",
      'notes', logistics_row."Notes",
      'created_at', logistics_row."Created_At",
      'updated_at', logistics_row."Updated_At"
    ),
    'appointment', null
  );
end;
$$;

create or replace function public.receive_salon_dropoff_after_completion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_user_id integer;
begin
  if public.normalize_flow_key(new."Status") = 'completed'
     and (tg_op = 'INSERT' or old."Status" is distinct from new."Status") then
    actor_user_id := public.current_app_user_id();

    update public."Hair_Submission_Logistics"
    set "Shipment_Status" = 'Received',
        "Received_By" = coalesce(actor_user_id, "Received_By"),
        "Received_At" = coalesce("Received_At", new."Completed_At", timezone('Asia/Manila', now())),
        "Updated_By" = coalesce(actor_user_id, "Updated_By"),
        "Updated_At" = timezone('Asia/Manila', now())
    where "Submission_ID" = new."Hair_Submission_ID"
      and "Logistics_Type" in ('Salon Dropoff', 'Walk-in Drop-off');
  end if;

  return new;
end;
$$;

-- Appointment cancellation/No Show closes the master donation while keeping
-- the old submission and its forward AI_Screening_ID link for history. The
-- nullable reverse link is released so the same screening may be re-evaluated
-- for a brand-new donation.
create or replace function public.close_walk_in_donation_after_arrival_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cancellation_note text;
  screening_id integer;
begin
  if new."Status" in ('No Show', 'Cancelled')
     and (tg_op = 'INSERT' or old."Status" is distinct from new."Status") then
    cancellation_note := coalesce(
      nullif(btrim(new."Cancellation_Reason"), ''),
      case when new."Status" = 'No Show'
        then 'Walk-in donor did not arrive on the expected drop-off date.'
        else 'Walk-in donation was cancelled before arrival.'
      end
    );

    select submission."AI_Screening_ID"
    into screening_id
    from public."Hair_Submissions" submission
    where submission."Submission_ID" = new."Hair_Submission_ID"
    for update;

    update public."Hair_Submissions"
    set "Status" = 'Cancelled',
        "Donor_Notes" = case
          when coalesce("Donor_Notes", '') ilike '%' || cancellation_note || '%' then "Donor_Notes"
          else concat_ws(E'\n', nullif(btrim(coalesce("Donor_Notes", '')), ''), cancellation_note)
        end,
        "Updated_At" = timezone('Asia/Manila', now())
    where "Submission_ID" = new."Hair_Submission_ID"
      and public.normalize_flow_key(coalesce("Status", '')) <> 'cancelled';

    update public."Hair_Submission_Logistics"
    set "Shipment_Status" = 'Cancelled',
        "Notes" = cancellation_note,
        "Updated_By" = coalesce(public.current_app_user_id(), "Updated_By"),
        "Updated_At" = timezone('Asia/Manila', now())
    where "Submission_ID" = new."Hair_Submission_ID"
      and "Logistics_Type" in ('Salon Dropoff', 'Walk-in Drop-off')
      and coalesce("Shipment_Status", '') <> 'Received';

    update public."AI_Screenings"
    set "Submission_ID" = null
    where "AI_Screening_ID" = screening_id
      and "Submission_ID" = new."Hair_Submission_ID";
  end if;

  return new;
end;
$$;

drop trigger if exists trg_close_walk_in_after_arrival_cancellation
on public."Salon_Donation_Appointments";
create trigger trg_close_walk_in_after_arrival_cancellation
after insert or update of "Status"
on public."Salon_Donation_Appointments"
for each row
execute function public.close_walk_in_donation_after_arrival_cancellation();

-- A donor-side cancellation starts at Hair_Submissions in the current mobile
-- service. Synchronize its walk-in arrival row instead of leaving it Expected.
create or replace function public.cancel_walk_in_arrival_after_submission_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.normalize_flow_key(coalesce(new."Status", '')) = 'cancelled'
     and public.normalize_flow_key(coalesce(old."Status", '')) <> 'cancelled' then
    update public."Salon_Donation_Appointments" appointment
    set "Status" = 'Cancelled',
        "Cancelled_At" = coalesce(appointment."Cancelled_At", timezone('Asia/Manila', now())),
        "Cancellation_Reason" = coalesce(
          nullif(btrim(appointment."Cancellation_Reason"), ''),
          'Walk-in donation was cancelled by the donor.'
        ),
        "Updated_At" = timezone('Asia/Manila', now())
    where appointment."Hair_Submission_ID" = new."Submission_ID"
      and appointment."Status" in ('Confirmed', 'Rescheduled');

    update public."AI_Screenings"
    set "Submission_ID" = null
    where "AI_Screening_ID" = new."AI_Screening_ID"
      and "Submission_ID" = new."Submission_ID";
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cancel_walk_in_after_submission_cancellation
on public."Hair_Submissions";
create trigger trg_cancel_walk_in_after_submission_cancellation
after update of "Status"
on public."Hair_Submissions"
for each row
execute function public.cancel_walk_in_arrival_after_submission_cancellation();

-- A cancelled Walk-in submission is historical. It cannot be changed back to
-- Pending/Confirmed; another attempt must pass eligibility again and create a
-- new submission with a new waybill.
create or replace function public.guard_cancelled_walk_in_submission_reactivation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.normalize_flow_key(coalesce(old."Status", '')) = 'cancelled'
     and public.normalize_flow_key(coalesce(new."Status", '')) <> 'cancelled'
     and exists (
       select 1
       from public."Hair_Submission_Logistics" logistics
       where logistics."Submission_ID" = old."Submission_ID"
         and logistics."Logistics_Type" in ('Salon Dropoff', 'Walk-in Drop-off')
     ) then
    raise exception 'A cancelled Walk-in donation cannot be reopened. Start a new Walk-in donation.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_cancelled_walk_in_submission_reactivation
on public."Hair_Submissions";
create trigger trg_guard_cancelled_walk_in_submission_reactivation
before update of "Status"
on public."Hair_Submissions"
for each row
execute function public.guard_cancelled_walk_in_submission_reactivation();

create or replace function public.update_walk_in_arrival_status(
  p_appointment_id integer,
  p_action text,
  p_cancellation_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  action_key text := public.normalize_flow_key(coalesce(p_action, ''));
  target_status text;
  appointment_row public."Salon_Donation_Appointments"%rowtype;
begin
  if auth.uid() is null or not public.current_app_user_is_staff() then
    raise exception 'Only authorized staff can update an expected walk-in.'
      using errcode = '42501';
  end if;

  target_status := case action_key
    when 'checkin' then 'Checked In'
    when 'checkedin' then 'Checked In'
    when 'complete' then 'Completed'
    when 'completed' then 'Completed'
    when 'noshow' then 'No Show'
    when 'cancel' then 'Cancelled'
    when 'cancelled' then 'Cancelled'
    else null
  end;
  if target_status is null then
    raise exception 'Choose Check In, Complete, No Show, or Cancel.';
  end if;

  update public."Salon_Donation_Appointments" appointment
  set "Status" = target_status,
      "Cancellation_Reason" = case
        when target_status in ('No Show', 'Cancelled') then nullif(btrim(p_cancellation_reason), '')
        else appointment."Cancellation_Reason"
      end
  where appointment."Appointment_ID" = p_appointment_id
    and exists (
      select 1
      from public."Hair_Submission_Logistics" logistics
      where logistics."Submission_ID" = appointment."Hair_Submission_ID"
        and logistics."Logistics_Type" in ('Salon Dropoff', 'Walk-in Drop-off')
    )
  returning appointment.* into appointment_row;

  if not found then
    raise exception 'Expected walk-in donation was not found.' using errcode = 'P0002';
  end if;

  return to_jsonb(appointment_row);
end;
$$;

create or replace function public.get_expected_walk_in_donations(
  p_expected_date date default timezone('Asia/Manila', now())::date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.current_app_user_is_staff() then
    raise exception 'Only authorized staff can view expected walk-in donations.'
      using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'appointment_id', appointment."Appointment_ID",
      'expected_arrival_at', appointment."Appointment_Start_At",
      'status', appointment."Status",
      'checked_in_at', appointment."Checked_In_At",
      'completed_at', appointment."Completed_At",
      'cancelled_at', appointment."Cancelled_At",
      'cancellation_reason', appointment."Cancellation_Reason",
      'submission_id', submission."Submission_ID",
      'waybill_code', submission."Waybill_Code",
      'submission_status', submission."Status",
      'donor', jsonb_build_object(
        'user_id', details.user_id,
        'first_name', details.first_name,
        'middle_name', details.middle_name,
        'last_name', details.last_name,
        'suffix', details.suffix,
        'contact_number', details.contact_number
      )
    ) order by appointment."Appointment_Start_At", appointment."Appointment_ID")
    from public."Salon_Donation_Appointments" appointment
    join public."Hair_Submissions" submission
      on submission."Submission_ID" = appointment."Hair_Submission_ID"
    join public."Hair_Submission_Logistics" logistics
      on logistics."Submission_ID" = submission."Submission_ID"
     and logistics."Logistics_Type" in ('Salon Dropoff', 'Walk-in Drop-off')
    left join lateral (
      select profile.*
      from public.user_details profile
      where profile.user_id = submission."User_ID"
      order by profile.updated_at desc nulls last
      limit 1
    ) details on true
    where appointment."Appointment_Start_At"::date = coalesce(
      p_expected_date,
      timezone('Asia/Manila', now())::date
    )
  ), '[]'::jsonb);
end;
$$;

-- Authorized staff can resolve an exact internal waybill without exposing the
-- underlying tables to an unauthenticated lookup. This function is read-only;
-- searching never changes any lifecycle status.
create or replace function public.get_logistics_donation_by_waybill(
  p_waybill_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_waybill text := upper(btrim(coalesce(p_waybill_code, '')));
  submission_row public."Hair_Submissions"%rowtype;
  donor_profile jsonb;
  logistics_data jsonb;
  appointment_data jsonb;
  detail_data jsonb;
begin
  if auth.uid() is null or not public.current_app_user_is_staff() then
    raise exception 'Only authorized staff can search logistics waybills.'
      using errcode = '42501';
  end if;

  if normalized_waybill !~ '^WB[A-Z0-9]{6}$' then
    raise exception 'Waybill not found.' using errcode = 'P0002';
  end if;

  select submission.*
  into submission_row
  from public."Hair_Submissions" submission
  where submission."Waybill_Code" = normalized_waybill
  limit 1;

  if not found then
    raise exception 'Waybill not found.' using errcode = 'P0002';
  end if;

  if submission_row."From_Event" is true then
    raise exception 'This code is not a valid logistics waybill.'
      using errcode = '23514';
  end if;

  select jsonb_build_object(
    'user_id', details.user_id,
    'first_name', details.first_name,
    'middle_name', details.middle_name,
    'last_name', details.last_name,
    'suffix', details.suffix,
    'birthdate', details.birthdate,
    'contact_number', details.contact_number
  )
  into donor_profile
  from public.user_details details
  where details.user_id = submission_row."User_ID"
  order by details.updated_at desc nulls last
  limit 1;

  select to_jsonb(logistics)
  into logistics_data
  from public."Hair_Submission_Logistics" logistics
  where logistics."Submission_ID" = submission_row."Submission_ID"
  limit 1;

  select to_jsonb(appointment)
  into appointment_data
  from public."Salon_Donation_Appointments" appointment
  where appointment."Hair_Submission_ID" = submission_row."Submission_ID"
  limit 1;

  select coalesce(
    jsonb_agg(to_jsonb(detail) order by detail."Created_At", detail."Submission_Detail_ID"),
    '[]'::jsonb
  )
  into detail_data
  from public."Hair_Submission_Details" detail
  where detail."Submission_ID" = submission_row."Submission_ID";

  return jsonb_build_object(
    'submission', to_jsonb(submission_row),
    'donor', coalesce(donor_profile, '{}'::jsonb),
    'logistics', logistics_data,
    'appointment', appointment_data,
    'details', detail_data
  );
end;
$$;

revoke all on function public.get_available_walk_in_dates()
from public, anon;
grant execute on function public.get_available_walk_in_dates()
to authenticated;

revoke all on function public.schedule_salon_logistics_donation(
  timestamp without time zone,
  text,
  text,
  text,
  text,
  integer
) from public, anon;
grant execute on function public.schedule_salon_logistics_donation(
  timestamp without time zone,
  text,
  text,
  text,
  text,
  integer
) to authenticated;

revoke all on function public.confirm_courier_logistics_donation(text, text, text)
from public, anon;
grant execute on function public.confirm_courier_logistics_donation(text, text, text)
to authenticated;

revoke all on function public.get_logistics_donation_by_waybill(text)
from public, anon, authenticated;
grant execute on function public.get_logistics_donation_by_waybill(text)
to authenticated;

revoke all on function public.update_walk_in_arrival_status(integer, text, text)
from public, anon;
grant execute on function public.update_walk_in_arrival_status(integer, text, text)
to authenticated;

revoke all on function public.get_expected_walk_in_donations(date)
from public, anon;
grant execute on function public.get_expected_walk_in_donations(date)
to authenticated;

comment on function public.get_available_walk_in_dates()
is 'Returns open walk-in dates and effective receiving hours from operating hours and date overrides; no slots or capacity are generated.';

comment on function public.schedule_salon_logistics_donation(
  timestamp without time zone,
  text,
  text,
  text,
  text,
  integer
)
is 'Atomically validates an approximate expected arrival and creates an independent Hair_Submission, existing AI link, Walk-in Drop-off logistics, and expected-arrival record; passing a submission ID updates the same active record.';

comment on function public.confirm_courier_logistics_donation(text, text, text)
is 'Atomically revalidates current eligibility and creates one independent courier submission, immutable waybill, existing AI link, and Ship by Courier logistics row without a salon appointment.';

comment on function public.get_logistics_donation_by_waybill(text)
is 'Authorized staff-only exact lookup for an independent logistics donation and its donor, logistics, appointment, and hair-detail records.';

comment on function public.update_walk_in_arrival_status(integer, text, text)
is 'Staff-only Check In, Complete, No Show, or Cancel action for an expected walk-in. Late arrival remains check-in eligible until staff validly closes it.';

comment on function public.get_expected_walk_in_donations(date)
is 'Staff-only expected walk-in list for a selected date, including donor, waybill, and current arrival status.';

comment on column public."Hair_Submissions"."Waybill_Code"
is 'Immutable internal Donivra tracking identifier for independent logistics donations; generated by trg_assign_hair_submission_waybill_code.';

comment on column public."Hair_Submission_Logistics"."Tracking_Number"
is 'External courier tracking number only; never stores the internal Hair_Submissions.Waybill_Code.';

commit;

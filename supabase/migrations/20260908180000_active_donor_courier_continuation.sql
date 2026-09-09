begin;

-- Donors may maintain their own courier reference before receipt, but official
-- organization receipt fields remain staff-owned even through direct REST calls.
create or replace function public.restrict_donor_hair_logistics_writes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_user_id integer;
  owner_user_id integer;
  parent_status text;
  is_cancellation boolean := false;
begin
  -- Service-role/database maintenance has no end-user auth context. Staff is
  -- already authorized by the existing application role helper.
  if auth.uid() is null or public.current_app_user_is_staff() then
    return new;
  end if;

  actor_user_id := public.current_app_user_id();
  select submission."User_ID", public.normalize_flow_key(coalesce(submission."Status", ''))
  into owner_user_id, parent_status
  from public."Hair_Submissions" submission
  where submission."Submission_ID" = new."Submission_ID";

  if actor_user_id is null or owner_user_id is distinct from actor_user_id then
    raise insufficient_privilege using
      message = 'You cannot modify another donor''s logistics record.';
  end if;

  if tg_op = 'INSERT' then
    if new."Received_By" is not null or new."Received_At" is not null then
      raise insufficient_privilege using
        message = 'Package receipt can only be recorded by authorized staff.';
    end if;
    if public.normalize_flow_key(coalesce(new."Shipment_Status", '')) in
       ('received', 'packagereceived', 'receivedbyorganization', 'qualitychecking') then
      raise insufficient_privilege using
        message = 'Official shipment receipt status can only be recorded by authorized staff.';
    end if;
    return new;
  end if;

  is_cancellation := parent_status in ('cancelled', 'canceled')
    and public.normalize_flow_key(coalesce(new."Shipment_Status", '')) in ('cancelled', 'canceled');

  if new."Received_By" is distinct from old."Received_By"
     or new."Received_At" is distinct from old."Received_At" then
    raise insufficient_privilege using
      message = 'Package receipt can only be recorded by authorized staff.';
  end if;

  if new."Shipment_Status" is distinct from old."Shipment_Status"
     and not is_cancellation then
    raise insufficient_privilege using
      message = 'Official shipment status can only be changed by authorized staff.';
  end if;

  if public.normalize_flow_key(coalesce(old."Logistics_Type", '')) in ('shipbycourier', 'courier') then
    if new."Submission_ID" is distinct from old."Submission_ID"
       or public.normalize_flow_key(coalesce(new."Logistics_Type", '')) not in ('shipbycourier', 'courier')
       or new."Created_At" is distinct from old."Created_At"
       or new."Pickup_Schedule_Date" is distinct from old."Pickup_Schedule_Date"
       or new."Pickup_Scheduled_At" is distinct from old."Pickup_Scheduled_At"
       or new."Pickup_Approved_At" is distinct from old."Pickup_Approved_At"
       or new."Queue_Number" is distinct from old."Queue_Number"
       or new."Dropoff_Window" is distinct from old."Dropoff_Window"
       or new."Dropoff_Status" is distinct from old."Dropoff_Status"
       or new."Expected_Dropoff_Date" is distinct from old."Expected_Dropoff_Date"
       or new."Expected_Arrival_Time" is distinct from old."Expected_Arrival_Time"
       or new."Checked_In_At" is distinct from old."Checked_In_At"
       or new."Completed_At" is distinct from old."Completed_At"
       or new."Cancelled_At" is distinct from old."Cancelled_At"
       or new."Cancellation_Source" is distinct from old."Cancellation_Source"
       or new."Cancellation_Reason" is distinct from old."Cancellation_Reason" then
      raise insufficient_privilege using
        message = 'Donors may only edit courier-owned shipping details.';
    end if;

    if new."Notes" is distinct from old."Notes" and not is_cancellation then
      raise insufficient_privilege using
        message = 'Donors may only edit courier-owned shipping details.';
    end if;

    if new."Updated_By" is distinct from old."Updated_By"
       and new."Updated_By" is distinct from actor_user_id then
      raise insufficient_privilege using
        message = 'Donors cannot attribute logistics changes to another user.';
    end if;

    if new."Courier_Name" is distinct from old."Courier_Name"
       or new."Tracking_Number" is distinct from old."Tracking_Number" then
      if old."Received_At" is not null then
        raise insufficient_privilege using
          message = 'Courier details cannot be edited after package receipt.';
      end if;
      if nullif(btrim(coalesce(new."Courier_Name", '')), '') is null
         or nullif(btrim(coalesce(new."Tracking_Number", '')), '') is null then
        raise check_violation using
          message = 'Courier name and tracking number are both required.';
      end if;
      if not exists (
        select 1
        from public."Hair_Submission_Details" detail
        join public."Hair_Submission_Images" image
          on image."Submission_Detail_ID" = detail."Submission_Detail_ID"
        where detail."Submission_ID" = new."Submission_ID"
          and image."Image_Type" = 'independent_parcel_photo'
      ) then
        raise check_violation using
          message = 'Upload package proof before saving courier details.';
      end if;
      new."Courier_Name" := btrim(new."Courier_Name");
      new."Tracking_Number" := btrim(new."Tracking_Number");
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_restrict_donor_hair_logistics_writes
on public."Hair_Submission_Logistics";
create trigger trg_restrict_donor_hair_logistics_writes
before insert or update
on public."Hair_Submission_Logistics"
for each row
execute function public.restrict_donor_hair_logistics_writes();

-- Hair_Submission_Images belongs to a submission through its one detail row.
-- Create that pending review row through a narrow backend operation when the
-- atomic courier confirmation predates it; donors never choose its status.
create or replace function public.prepare_own_courier_package_proof(
  p_submission_id integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  actor_user_id integer;
  submission_row public."Hair_Submissions"%rowtype;
  screening_row public."AI_Screenings"%rowtype;
  detail_row public."Hair_Submission_Details"%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to upload package proof.' using errcode = '28000';
  end if;
  actor_user_id := public.current_app_user_id();
  if actor_user_id is null then
    raise exception 'Your signed-in account is not linked to an application user.' using errcode = '28000';
  end if;

  select submission.*
  into submission_row
  from public."Hair_Submissions" submission
  join public."Hair_Submission_Logistics" logistics
    on logistics."Submission_ID" = submission."Submission_ID"
  where submission."Submission_ID" = p_submission_id
    and submission."User_ID" = actor_user_id
    and submission."From_Event" = false
    and public.normalize_flow_key(logistics."Logistics_Type") in ('shipbycourier', 'courier')
    and logistics."Received_At" is null
  for update of submission;

  if not found then
    raise insufficient_privilege using
      message = 'This courier donation is not available for package proof.';
  end if;

  select detail.*
  into detail_row
  from public."Hair_Submission_Details" detail
  where detail."Submission_ID" = p_submission_id;

  if not found then
    select screening.*
    into screening_row
    from public."AI_Screenings" screening
    where screening."AI_Screening_ID" = submission_row."AI_Screening_ID"
      and screening."User_ID" = actor_user_id;

    insert into public."Hair_Submission_Details" (
      "Submission_ID",
      "Declared_Length",
      "Declared_Color",
      "Declared_Texture",
      "Declared_Density",
      "Declared_Condition",
      "Detail_Notes",
      "Status",
      "Updated_By"
    ) values (
      submission_row."Submission_ID",
      screening_row."Estimated_Length",
      screening_row."Detected_Color",
      screening_row."Detected_Texture",
      screening_row."Detected_Density",
      coalesce(nullif(btrim(screening_row."Detected_Condition"), ''), 'Pending physical verification'),
      'System-created pending detail for donor courier package proof.',
      'Pending',
      actor_user_id
    )
    returning * into detail_row;
  end if;

  return jsonb_build_object(
    'submission_detail_id', detail_row."Submission_Detail_ID",
    'submission_id', detail_row."Submission_ID",
    'declared_length', detail_row."Declared_Length",
    'declared_color', detail_row."Declared_Color",
    'declared_texture', detail_row."Declared_Texture",
    'declared_density', detail_row."Declared_Density",
    'declared_condition', detail_row."Declared_Condition",
    'status', detail_row."Status",
    'created_at', detail_row."Created_At",
    'updated_at', detail_row."Updated_At"
  );
end;
$$;

create or replace function public.update_own_courier_shipping_details(
  p_submission_id integer,
  p_courier_name text,
  p_tracking_number text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  actor_user_id integer;
  clean_courier_name text := nullif(btrim(coalesce(p_courier_name, '')), '');
  clean_tracking_number text := nullif(btrim(coalesce(p_tracking_number, '')), '');
  logistics_row public."Hair_Submission_Logistics"%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to save courier details.' using errcode = '28000';
  end if;
  actor_user_id := public.current_app_user_id();
  if actor_user_id is null then
    raise exception 'Your signed-in account is not linked to an application user.' using errcode = '28000';
  end if;
  if clean_courier_name is null then
    raise exception 'Courier name is required.' using errcode = '23514';
  end if;
  if clean_tracking_number is null then
    raise exception 'Tracking number is required.' using errcode = '23514';
  end if;

  select logistics.*
  into logistics_row
  from public."Hair_Submission_Logistics" logistics
  join public."Hair_Submissions" submission
    on submission."Submission_ID" = logistics."Submission_ID"
  where logistics."Submission_ID" = p_submission_id
    and submission."User_ID" = actor_user_id
    and submission."From_Event" = false
    and public.normalize_flow_key(logistics."Logistics_Type") in ('shipbycourier', 'courier')
  for update of logistics;

  if not found then
    raise insufficient_privilege using
      message = 'This courier donation is not available to the signed-in donor.';
  end if;
  if logistics_row."Received_At" is not null then
    raise exception 'Courier details cannot be edited after package receipt.' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public."Hair_Submission_Details" detail
    join public."Hair_Submission_Images" image
      on image."Submission_Detail_ID" = detail."Submission_Detail_ID"
    where detail."Submission_ID" = p_submission_id
      and image."Image_Type" = 'independent_parcel_photo'
  ) then
    raise exception 'Upload package proof before saving courier details.' using errcode = '23514';
  end if;

  update public."Hair_Submission_Logistics"
  set "Courier_Name" = clean_courier_name,
      "Tracking_Number" = clean_tracking_number,
      "Updated_By" = actor_user_id,
      "Updated_At" = timezone('Asia/Manila', now())
  where "Submission_Logistics_ID" = logistics_row."Submission_Logistics_ID"
  returning * into logistics_row;

  return jsonb_build_object(
    'submission_logistics_id', logistics_row."Submission_Logistics_ID",
    'submission_id', logistics_row."Submission_ID",
    'logistics_type', logistics_row."Logistics_Type",
    'shipment_status', logistics_row."Shipment_Status",
    'courier_name', logistics_row."Courier_Name",
    'tracking_number', logistics_row."Tracking_Number",
    'received_by', logistics_row."Received_By",
    'received_at', logistics_row."Received_At",
    'created_at', logistics_row."Created_At",
    'updated_at', logistics_row."Updated_At"
  );
end;
$$;

revoke all on function public.restrict_donor_hair_logistics_writes() from public;
revoke all on function public.prepare_own_courier_package_proof(integer) from public;
revoke all on function public.update_own_courier_shipping_details(integer, text, text) from public;
grant execute on function public.prepare_own_courier_package_proof(integer) to authenticated;
grant execute on function public.update_own_courier_shipping_details(integer, text, text) to authenticated;

comment on function public.update_own_courier_shipping_details(integer, text, text)
is 'Updates the signed-in donor''s courier name and external tracking number only after package proof exists and before staff receipt.';

commit;

begin;

-- Validate the code and grant access in one database transaction. The caller's
-- database user is resolved from auth.uid(); no client-supplied User_ID is trusted.
create or replace function public.unlock_private_event_request_by_code(
  p_access_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := upper(btrim(coalesce(p_access_code, '')));
  unlocked_event public."Event_Requests"%rowtype;
  current_user_id integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to open a private event.'
      using errcode = '28000';
  end if;

  if normalized_code = '' then
    raise exception 'Enter a valid private event code.'
      using errcode = '22023';
  end if;

  current_user_id := public.current_app_user_id();
  if current_user_id is null then
    raise exception 'Your signed-in account is not linked to an application user.'
      using errcode = '28000';
  end if;

  select event_request.*
  into unlocked_event
  from public."Event_Requests" event_request
  where upper(btrim(event_request."Private_Event_Code")) = normalized_code
    and public.normalize_flow_key(coalesce(event_request."Status", '')) = 'approved'
    and public.normalize_flow_key(coalesce(event_request."Event_Visibility", '')) = 'private'
    and (
      event_request."End_Date" is null
      or event_request."End_Date" >= date_trunc('day', timezone('Asia/Manila', now()))
    )
  limit 1;

  if not found then
    raise exception 'No active private event matches this code.'
      using errcode = 'P0001';
  end if;

  insert into public."Private_Event_Access" (
    "Event_Application_ID",
    "User_ID"
  ) values (
    unlocked_event."Event_Application_ID",
    current_user_id
  )
  on conflict ("Event_Application_ID", "User_ID") do nothing;

  -- Deliberately omit Private_Event_Code from the returned payload.
  return jsonb_build_object(
    'event_request_id', unlocked_event."Event_Request_ID",
    'donation_drive_id', unlocked_event."Event_Request_ID",
    'event_application_id', unlocked_event."Event_Application_ID",
    'event_title', unlocked_event."Event_Name",
    'event_by', unlocked_event."Event_By",
    'partnered_with', unlocked_event."Partnered_With",
    'partner_social_media_link', unlocked_event."Partner_Social_Media_Link",
    'start_date', unlocked_event."Start_Date",
    'end_date', unlocked_event."End_Date",
    'venue_name', unlocked_event."Venue_Name",
    'event_image_url', unlocked_event."Event_Photo_URL",
    'street', unlocked_event."Street",
    'region', unlocked_event."Region",
    'barangay', unlocked_event."Barangay",
    'city', unlocked_event."City_Municipality",
    'province', unlocked_event."Province",
    'country', unlocked_event."Country",
    'latitude', unlocked_event."Latitude",
    'longitude', unlocked_event."Longitude",
    'status', unlocked_event."Status",
    'event_visibility', unlocked_event."Event_Visibility",
    'staff_contact_notes', unlocked_event."Staff_Contact_Notes",
    'admin_decision_reason', unlocked_event."Admin_Decision_Reason",
    'updated_at', unlocked_event."Updated_At"
  );
end;
$$;

revoke all on function public.unlock_private_event_request_by_code(text) from public;
revoke all on function public.unlock_private_event_request_by_code(text) from anon;
grant execute on function public.unlock_private_event_request_by_code(text) to authenticated;

comment on function public.unlock_private_event_request_by_code(text)
is 'Validates a donor private-event code, records access, and returns the matching approved active event without exposing its code.';

commit;

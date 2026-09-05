-- Remove only patient-owned, never-submitted wig request drafts. Submitted,
-- approved, allocated, cancelled, and other historical requests are preserved.

create or replace function public.patient_discard_incomplete_wig_request(
  p_req_id integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id integer := public.current_app_user_id();
  v_request_id integer;
begin
  if auth.uid() is null or v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select wr."Req_ID"
  into v_request_id
  from public."Wig_Requests" wr
  join public."Patients" p on p."Patient_ID" = wr."Patient_ID"
  where wr."Req_ID" = p_req_id
    and p."User_ID" = v_user_id
    and lower(trim(coalesce(wr."Status", ''))) = 'pending'
    and wr."Requested_Wig_ID" is null
    and wr."Requested_Wig_Specification_ID" is null
    and wr."Allocated_Wig_ID" is null
    and wr."Approved_By" is null
    and wr."Approved_At" is null
  for update of wr;

  if v_request_id is null then
    raise exception 'Only your own unfinished wig request can be discarded';
  end if;

  -- Try-on images are working data for this unfinished request. Delete them
  -- before the request so the Req_ID ON DELETE SET NULL relationship cannot
  -- leave orphaned patient preview rows behind.
  delete from public."Wig_Virtual_TryOn_Results"
  where "Req_ID" = v_request_id;

  delete from public."Wig_Requests"
  where "Req_ID" = v_request_id;

  return true;
end;
$$;

revoke all on function public.patient_discard_incomplete_wig_request(integer) from public;
revoke all on function public.patient_discard_incomplete_wig_request(integer) from anon;
grant execute on function public.patient_discard_incomplete_wig_request(integer) to authenticated;

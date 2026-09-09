-- A patient may confirm physical wig receipt without uploading a photo.
-- When a photo is supplied, it must still belong to the authenticated user.

create or replace function public.patient_accept_wig_release_receipt(
  p_receipt_id bigint,
  p_confirmation_photo_path text
)
returns public.wig_release_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.current_app_user_id();
  v_auth_id uuid := auth.uid();
  v_photo_path text := nullif(trim(p_confirmation_photo_path), '');
  v_receipt public.wig_release_receipts%rowtype;
begin
  if v_user_id is null or v_auth_id is null then
    raise exception 'Authentication required';
  end if;

  if v_photo_path is not null
     and split_part(v_photo_path, '/', 1) <> v_auth_id::text then
    raise exception 'Invalid confirmation photo path';
  end if;

  update public.wig_release_receipts r
  set confirmation_photo_path = v_photo_path,
      received_confirmed_at = timezone('Asia/Manila', now()),
      terms_accepted_at = timezone('Asia/Manila', now()),
      accepted_by = v_user_id,
      updated_at = timezone('Asia/Manila', now())
  from public."Wig_Requests" wr
  join public."Patients" p on p."Patient_ID" = wr."Patient_ID"
  where r.receipt_id = p_receipt_id
    and wr."Req_ID" = r.req_id
    and p."User_ID" = v_user_id
    and lower(trim(coalesce(wr."Status", ''))) = 'released'
    and r.received_confirmed_at is null
    and r.terms_accepted_at is null
    and r.accepted_by is null
    and r.release_cycle = (
      select max(latest.release_cycle)
      from public.wig_release_receipts latest
      where latest.req_id = r.req_id
    )
  returning r.* into v_receipt;

  if v_receipt.receipt_id is null then
    if exists (
      select 1
      from public.wig_release_receipts existing
      join public."Wig_Requests" request on request."Req_ID" = existing.req_id
      join public."Patients" patient on patient."Patient_ID" = request."Patient_ID"
      where existing.receipt_id = p_receipt_id
        and patient."User_ID" = v_user_id
        and existing.received_confirmed_at is not null
    ) then
      raise exception 'Wig receipt already confirmed';
    end if;
    raise exception 'This receipt cannot be confirmed';
  end if;

  return v_receipt;
end;
$$;

revoke all on function public.patient_accept_wig_release_receipt(bigint, text) from public, anon;
grant execute on function public.patient_accept_wig_release_receipt(bigint, text) to authenticated;

-- Receipt confirmation is release-cycle-specific. A released request is not
-- considered received until the patient confirms the latest receipt.

alter table public.wig_release_receipts
  add column if not exists confirmation_photo_path text,
  add column if not exists pdf_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wig_release_documents', 'wig_release_documents', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "patients_upload_own_wig_release_documents" on storage.objects;
create policy "patients_upload_own_wig_release_documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'wig_release_documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "patients_read_own_wig_release_documents" on storage.objects;
create policy "patients_read_own_wig_release_documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'wig_release_documents'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.current_app_user_is_staff())
);

drop policy if exists "patients_remove_own_wig_release_documents" on storage.objects;
create policy "patients_remove_own_wig_release_documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'wig_release_documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop function if exists public.patient_accept_wig_release_receipt(bigint);
create function public.patient_accept_wig_release_receipt(
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
  v_receipt public.wig_release_receipts%rowtype;
begin
  if v_user_id is null or v_auth_id is null then raise exception 'Authentication required'; end if;
  if coalesce(trim(p_confirmation_photo_path), '') = ''
     or split_part(trim(p_confirmation_photo_path), '/', 1) <> v_auth_id::text then
    raise exception 'A valid confirmation photo is required';
  end if;

  update public.wig_release_receipts r
  set confirmation_photo_path = trim(p_confirmation_photo_path),
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
      select 1 from public.wig_release_receipts existing
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

create or replace function public.patient_set_wig_release_receipt_pdf_path(
  p_receipt_id bigint,
  p_pdf_path text
)
returns public.wig_release_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.current_app_user_id();
  v_auth_id uuid := auth.uid();
  v_receipt public.wig_release_receipts%rowtype;
begin
  if v_user_id is null or v_auth_id is null then raise exception 'Authentication required'; end if;
  if coalesce(trim(p_pdf_path), '') = ''
     or split_part(trim(p_pdf_path), '/', 1) <> v_auth_id::text then
    raise exception 'A valid receipt PDF path is required';
  end if;

  update public.wig_release_receipts r
  set pdf_path = coalesce(r.pdf_path, trim(p_pdf_path)),
      updated_at = timezone('Asia/Manila', now())
  from public."Wig_Requests" wr
  join public."Patients" p on p."Patient_ID" = wr."Patient_ID"
  where r.receipt_id = p_receipt_id
    and wr."Req_ID" = r.req_id
    and p."User_ID" = v_user_id
    and r.received_confirmed_at is not null
    and r.release_cycle = (
      select max(latest.release_cycle)
      from public.wig_release_receipts latest
      where latest.req_id = r.req_id
    )
  returning r.* into v_receipt;

  if v_receipt.receipt_id is null then raise exception 'This receipt PDF cannot be saved'; end if;
  return v_receipt;
end;
$$;

drop function if exists public.patient_submit_wig_release_appeal(bigint, text, text, jsonb);
create function public.patient_submit_wig_release_appeal(
  p_receipt_id bigint,
  p_reason text,
  p_description text,
  p_evidence_paths jsonb,
  p_requested_resolution text
)
returns public.wig_release_appeals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.current_app_user_id();
  v_auth_id uuid := auth.uid();
  v_receipt public.wig_release_receipts%rowtype;
  v_appeal public.wig_release_appeals%rowtype;
begin
  if v_user_id is null or v_auth_id is null then raise exception 'Authentication required'; end if;
  select r.* into v_receipt
  from public.wig_release_receipts r
  join public."Wig_Requests" wr on wr."Req_ID" = r.req_id
  join public."Patients" p on p."Patient_ID" = wr."Patient_ID"
  where r.receipt_id = p_receipt_id
    and p."User_ID" = v_user_id
    and lower(trim(coalesce(wr."Status", ''))) = 'released'
    and r.release_cycle = (
      select max(latest.release_cycle)
      from public.wig_release_receipts latest
      where latest.req_id = r.req_id
    );

  if v_receipt.receipt_id is null then raise exception 'Release receipt unavailable'; end if;
  if v_receipt.received_confirmed_at is null then raise exception 'Confirm receipt before reporting a problem'; end if;
  if timezone('Asia/Manila', now()) > v_receipt.appeal_deadline then raise exception 'The appeal deadline has passed'; end if;
  if trim(coalesce(p_reason, '')) not in ('Damaged on Receipt', 'Wrong Wig', 'Poor Fit', 'Other') then
    raise exception 'Choose a valid problem reason';
  end if;
  if trim(coalesce(p_requested_resolution, '')) not in ('Repair or Replace', 'Return and Close') then
    raise exception 'Choose what you would like us to do';
  end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'Describe the wig problem'; end if;
  if jsonb_typeof(p_evidence_paths) <> 'array'
     or jsonb_array_length(p_evidence_paths) not between 1 and 4 then
    raise exception 'Attach 1 to 4 wig photos';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_evidence_paths) path
    where split_part(path, '/', 1) <> v_auth_id::text
  ) then
    raise exception 'Invalid appeal photo path';
  end if;

  insert into public.wig_release_appeals (
    receipt_id, req_id, submitted_by, reason, description, evidence_paths,
    requested_resolution, status
  ) values (
    p_receipt_id, v_receipt.req_id, v_user_id, trim(p_reason), trim(p_description),
    p_evidence_paths, trim(p_requested_resolution), 'Pending Staff Review'
  ) returning * into v_appeal;
  return v_appeal;
end;
$$;

revoke all on function public.patient_accept_wig_release_receipt(bigint, text) from public, anon;
revoke all on function public.patient_set_wig_release_receipt_pdf_path(bigint, text) from public, anon;
revoke all on function public.patient_submit_wig_release_appeal(bigint, text, text, jsonb, text) from public, anon;
grant execute on function public.patient_accept_wig_release_receipt(bigint, text) to authenticated;
grant execute on function public.patient_set_wig_release_receipt_pdf_path(bigint, text) to authenticated;
grant execute on function public.patient_submit_wig_release_appeal(bigint, text, text, jsonb, text) to authenticated;

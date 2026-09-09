begin;

alter table public."Email_Outbox"
  drop constraint if exists email_outbox_type_check;

alter table public."Email_Outbox"
  add constraint email_outbox_type_check check (
    "Email_Type" in (
      'donation_certificate',
      'donation_status_update',
      'donation_event_announcement',
      'donation_event_rsvp',
      'donation_event_reminder',
      'patient_wig_request_update'
    )
  );

create or replace function public.enqueue_patient_wig_request_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  patient_user_id integer;
  milestone_key text;
  event_key text;
  status_key text := public.normalize_flow_key(coalesce(new."Status", ''));
begin
  if tg_op = 'INSERT' then
    milestone_key := 'request_submitted';
  elsif new."Status" is distinct from old."Status" then
    milestone_key := case status_key
      when 'pending' then 'request_submitted'
      when 'acceptedwigallocated' then 'wig_allocated'
      when 'acceptedinproduction' then 'wig_in_production'
      when 'readyforpickup' then 'ready_for_pickup'
      when 'toberelease' then 'preparing_for_release'
      when 'releasing' then 'wig_being_released'
      when 'released' then 'wig_released'
      when 'rejected' then 'request_rejected'
      when 'cancelled' then 'request_cancelled'
      when 'canceled' then 'request_cancelled'
      else null
    end;
  elsif new."Expected_Release_At" is distinct from old."Expected_Release_At"
    and new."Expected_Release_At" is not null then
    milestone_key := 'expected_release_updated';
  end if;

  if milestone_key is null then
    return new;
  end if;

  select patient."User_ID"
  into patient_user_id
  from public."Patients" patient
  where patient."Patient_ID" = new."Patient_ID";

  if patient_user_id is null then
    return new;
  end if;

  event_key := case
    when milestone_key = 'expected_release_updated' then
      concat('expected_release_updated:', new."Expected_Release_At"::text)
    else concat('status:', milestone_key)
  end;

  perform public.enqueue_donivra_email(
    patient_user_id,
    'patient_wig_request_update',
    'wig_request',
    new."Req_ID"::text,
    event_key,
    jsonb_strip_nulls(jsonb_build_object(
      'milestone_key', milestone_key,
      'status', new."Status",
      'status_reason', new."Status_Reason",
      'expected_release_at', new."Expected_Release_At",
      'updated_at', new."Updated_At"
    ))
  );

  return new;
end;
$$;

drop trigger if exists trg_enqueue_patient_wig_request_email
on public."Wig_Requests";

create trigger trg_enqueue_patient_wig_request_email
after insert or update of "Status", "Expected_Release_At"
on public."Wig_Requests"
for each row
execute function public.enqueue_patient_wig_request_email();

revoke all on function public.enqueue_patient_wig_request_email()
from public, anon, authenticated;

comment on function public.enqueue_patient_wig_request_email() is
  'Queues patient-owned wig request submission, status, and expected-release email updates without changing donor notifications.';

commit;

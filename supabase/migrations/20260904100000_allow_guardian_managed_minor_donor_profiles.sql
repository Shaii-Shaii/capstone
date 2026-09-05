begin;

-- A donor profile may represent a minor when a parent or legal guardian has
-- completed the active donation consent. Keep this check in PostgreSQL so a
-- client cannot bypass it by submitting a birthdate directly.
create or replace function public.has_active_guardian_donation_consent(
  p_user_id integer
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.guardian_consents consent
    where consent.user_id = p_user_id
      and public.normalize_flow_key(coalesce(consent.consent_status, '')) = 'active'
      and consent.minor_donation_allowed is true
      and consent.ai_image_processing_allowed is true
      and consent.revoked_at is null
  );
$$;

-- This function already backs trg_enforce_adult_non_patient_user_details on
-- user_details. CREATE OR REPLACE preserves that trigger while replacing its
-- outdated blanket adult-only rule.
create or replace function public.enforce_adult_non_patient_user_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if new.birthdate is null then
    return new;
  end if;

  select public.normalize_app_role(account.role)
  into v_role
  from public.users account
  where account.user_id = new.user_id;

  -- Patients already follow their separate patient/guardian workflow.
  if coalesce(v_role, '') = 'patient' then
    return new;
  end if;

  if new.birthdate > (
    timezone('Asia/Manila', now())::date - interval '18 years'
  ) then
    if coalesce(v_role, '') in ('donor', 'tentative')
       and public.has_active_guardian_donation_consent(new.user_id) then
      return new;
    end if;

    if coalesce(v_role, '') in ('donor', 'tentative') then
      raise exception 'Active guardian consent is required for donor account holders below 18 years old.'
        using errcode = '23514';
    end if;

    raise exception 'Account holders must be at least 18 years old.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.has_active_guardian_donation_consent(integer)
from public, anon, authenticated;
revoke all on function public.enforce_adult_non_patient_user_details()
from public, anon, authenticated;

comment on function public.has_active_guardian_donation_consent(integer)
is 'Returns whether a donor has current, non-revoked guardian consent for donation and AI image processing.';

comment on function public.enforce_adult_non_patient_user_details()
is 'Allows minor donor/tentative profiles only with active guardian donation consent; other non-patient account roles remain adult-only.';

commit;

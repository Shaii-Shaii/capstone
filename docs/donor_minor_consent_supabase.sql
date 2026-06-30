-- Donivra minor donor consent additions for the existing lowercase schema.
-- Paste into Supabase SQL Editor and run once.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'legal-documents',
    'legal-documents',
    false,
    10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'guardian-consent-documents',
    'guardian-consent-documents',
    false,
    10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

create table if not exists public.legal_documents (
  legal_document_id integer generated always as identity primary key,
  document_type character varying not null,
  version character varying not null,
  title character varying not null,
  content text not null,
  is_active boolean default true,
  effective_at timestamp without time zone default now(),
  created_at timestamp without time zone default now(),
  file_path character varying
);

alter table public.legal_documents
  add column if not exists file_path character varying;

create table if not exists public.user_legal_agreements (
  agreement_id integer generated always as identity primary key,
  user_id integer not null references public.users(user_id),
  legal_document_id integer not null references public.legal_documents(legal_document_id),
  is_accepted boolean default true,
  accepted_at timestamp without time zone default now(),
  ip_address character varying,
  user_agent text
);

create table if not exists public.guardian_consents (
  guardian_consent_id integer generated always as identity primary key,
  user_id integer not null references public.users(user_id),
  guardian_full_name character varying not null,
  guardian_relationship character varying not null,
  guardian_email character varying,
  guardian_contact_number character varying not null,
  consent_status character varying default 'Active',
  consent_method character varying default 'Electronic Checkbox',
  consent_text_snapshot text,
  consented_at timestamp without time zone default now(),
  revoked_at timestamp without time zone,
  minor_donation_allowed boolean default true,
  ai_image_processing_allowed boolean default true,
  public_posting_allowed boolean default false,
  guardian_id_file_path character varying,
  consent_document_file_path character varying,
  guardian_id_verification_status character varying default 'Pending',
  guardian_id_reviewed_by integer references public.users(user_id),
  guardian_id_reviewed_at timestamp without time zone
);

alter table public.guardian_consents
  add column if not exists guardian_id_file_path character varying,
  add column if not exists consent_document_file_path character varying,
  add column if not exists guardian_id_verification_status character varying default 'Pending',
  add column if not exists guardian_id_reviewed_by integer references public.users(user_id),
  add column if not exists guardian_id_reviewed_at timestamp without time zone;

alter table public."Hair_Submissions"
  add column if not exists "Guardian_Consent_ID" integer references public.guardian_consents(guardian_consent_id),
  add column if not exists "Donor_Age_At_Submission" integer check ("Donor_Age_At_Submission" is null or "Donor_Age_At_Submission" >= 0),
  add column if not exists "Consent_Checked_At" timestamp without time zone;

create index if not exists idx_legal_documents_active_type
  on public.legal_documents (document_type, is_active);

create index if not exists idx_user_legal_agreements_user
  on public.user_legal_agreements (user_id);

create index if not exists idx_guardian_consents_user_active
  on public.guardian_consents (user_id, consent_status, consented_at desc);

create index if not exists idx_guardian_consents_id_status
  on public.guardian_consents (guardian_id_verification_status);

insert into public.legal_documents
  (document_type, version, title, content, is_active, file_path)
select
  'Terms and Conditions',
  '1.0',
  'Donivra Terms and Conditions',
  'I have read and agree to Donivra Terms and Conditions. I understand that Donivra may manage my account, profile details, hair donation details, submitted images, donation tracking, and coordination records for the hair donation process.',
  true,
  'legal-documents/terms-and-conditions/1.0/document.pdf'
where not exists (
  select 1
  from public.legal_documents
  where document_type = 'Terms and Conditions'
    and version = '1.0'
);

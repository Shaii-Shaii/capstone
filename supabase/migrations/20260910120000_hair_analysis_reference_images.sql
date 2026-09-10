begin;

create table if not exists public.hair_analysis_reference_images (
  reference_image_id bigint generated always as identity primary key,
  reference_category text not null,
  reference_value text not null,
  title text not null,
  description text null,
  storage_bucket text not null default 'hair-analysis-reference-images',
  storage_path text not null,
  use_for_ai boolean not null default true,
  use_for_donor_ui boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hair_analysis_reference_images_unique_path unique (storage_bucket, storage_path),
  constraint hair_analysis_reference_images_category_check check (
    reference_category in ('texture', 'visible_oiliness', 'visible_flaking', 'visible_condition', 'density')
  )
);

create index if not exists idx_hair_analysis_reference_images_active_usage
  on public.hair_analysis_reference_images (reference_category, reference_value, sort_order)
  where is_active = true;

alter table public.hair_analysis_reference_images enable row level security;

drop policy if exists hair_analysis_reference_images_donor_read on public.hair_analysis_reference_images;
create policy hair_analysis_reference_images_donor_read
  on public.hair_analysis_reference_images
  for select
  to authenticated
  using (is_active = true and use_for_donor_ui = true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hair-analysis-reference-images',
  'hair-analysis-reference-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists hair_analysis_reference_objects_donor_read on storage.objects;
create policy hair_analysis_reference_objects_donor_read
  on storage.objects
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.hair_analysis_reference_images reference
      where reference.is_active = true
        and reference.use_for_donor_ui = true
        and reference.storage_bucket = bucket_id
        and reference.storage_path = name
    )
  );

comment on table public.hair_analysis_reference_images is
  'Staff-curated, database-managed visual references used by the donor Hair Check UI and/or server-side AI prompt. Storage remains private.';
comment on column public.hair_analysis_reference_images.use_for_ai is
  'Allows the server-side analyzer to include this approved reference with an explicit reference-image role.';
comment on column public.hair_analysis_reference_images.use_for_donor_ui is
  'Allows authenticated donors to receive a short-lived signed preview URL for visual answer cards.';

commit;

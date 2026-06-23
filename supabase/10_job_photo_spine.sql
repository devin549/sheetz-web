-- CB Cam spine: private job photos attached to jobs.
-- Run in Supabase SQL Editor. Idempotent and safe to re-run.
--
-- Files live in the private Supabase Storage bucket `job-photos`.
-- Metadata lives here so job detail, closeout, warranty proof, lawyer packets,
-- and customer-visible packets all share one source of truth.

create extension if not exists pgcrypto;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'job-photos',
  'job-photos',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  job_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into job_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'jobs'
    and a.attname = 'id'
    and not a.attisdropped;

  if job_id_type is null then
    raise exception 'public.jobs.id was not found';
  end if;

  execute format($create$
    create table if not exists public.job_photos (
      id uuid primary key default gen_random_uuid(),
      job_id %s not null references public.jobs(id) on delete cascade,
      storage_bucket text not null default 'job-photos',
      storage_path text not null unique,
      file_name text not null,
      mime_type text not null,
      size_bytes bigint not null default 0,
      kind text not null default 'job_photo',
      caption text,
      tags text[] not null default '{}',
      customer_visible boolean not null default false,
      uploaded_by uuid,
      uploaded_by_email text,
      uploaded_by_name text,
      deleted_at timestamptz,
      deleted_by uuid,
      created_at timestamptz not null default now(),
      constraint job_photos_kind_chk check (
        kind in (
          'job_photo',
          'before',
          'during',
          'after',
          'receipt',
          'damage',
          'equipment',
          'closeout'
        )
      )
    )
  $create$, job_id_type);
end $$;

create index if not exists job_photos_job_created_idx
  on public.job_photos (job_id, created_at desc)
  where deleted_at is null;

create index if not exists job_photos_customer_visible_idx
  on public.job_photos (job_id, customer_visible, created_at desc)
  where deleted_at is null and customer_visible = true;

create index if not exists job_photos_uploaded_by_idx
  on public.job_photos (uploaded_by, created_at desc)
  where deleted_at is null;

alter table public.job_photos enable row level security;

comment on table public.job_photos is
'Private metadata for CB Cam job photos. Storage objects live in the private job-photos bucket.';

comment on column public.job_photos.customer_visible is
'True only when this photo may appear in a customer-facing packet or portal.';

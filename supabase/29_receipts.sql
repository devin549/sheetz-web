-- Receipt review entries — Accounting works the receipt PHOTOS techs upload on jobs (job_photos
-- where kind='receipt'). One entry per receipt photo: vendor + amount + category + verify/flag.
-- REQUIRES supabase/23_job_photo_spine.sql (job_photos). Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.receipt_entries (
  id              uuid primary key default gen_random_uuid(),
  photo_id        uuid not null unique references public.job_photos(id) on delete cascade,
  job_id          text,
  vendor          text,
  amount_cents    int,
  category        text,             -- materials / fuel / tools / permit / other
  status          text not null default 'pending' check (status in ('pending', 'verified', 'flagged')),
  note            text,
  reviewed_by     uuid,
  reviewed_by_name text,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists receipt_entries_status_idx on public.receipt_entries (status, created_at desc);

-- RLS on, service-role only.
alter table public.receipt_entries enable row level security;

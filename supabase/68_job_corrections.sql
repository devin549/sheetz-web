-- CB Cam — correction work orders (the "tech already left → QA Hold" flow). When a photo fails QA and
-- the tech is gone, the office opens a correction: it references the original job + the failed photo +
-- the fail reason + the manager note + (via the review) the circle annotation. The original job goes on
-- QA Hold and cannot fully close until corrected proof passes OR a supervisor override is logged.
-- One photo system: this only LINKS the existing job_photos / job_photo_reviews / job_photo_annotations.
-- Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.job_corrections (
  id                 uuid primary key default gen_random_uuid(),
  orig_job_id        text not null,                                   -- the job that failed QA
  photo_id           uuid references public.job_photos(id) on delete set null,
  review_id          uuid references public.job_photo_reviews(id) on delete set null,
  fail_reason        text,
  manager_note       text,
  correction_job_id  text,                                            -- the scheduled correction visit (if booked)
  status             text not null default 'open' check (status in ('open','resolved','overridden')),
  customer_contacted boolean not null default false,
  contacted_by       text,
  contacted_at       timestamptz,
  created_by         uuid,
  created_by_name    text,
  resolved_by_name   text,
  resolved_at        timestamptz,
  override_reason    text,
  created_at         timestamptz not null default now()
);
create index if not exists job_corrections_orig_idx   on public.job_corrections (orig_job_id);
create index if not exists job_corrections_status_idx on public.job_corrections (status, created_at desc);

alter table public.job_corrections enable row level security;

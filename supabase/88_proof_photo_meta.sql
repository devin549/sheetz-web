-- Proof workspace — extra metadata the camera-first flow captures on each photo. Additive + idempotent.
-- (segment_id already added in 87.) qa_status mirrors the latest review for quick filtering; source marks
-- camera vs upload; lat/lng pin where the proof was shot.
alter table public.job_photos add column if not exists qa_status text not null default 'pending'
  check (qa_status in ('pending','pass','fail'));
alter table public.job_photos add column if not exists source text;          -- 'camera' | 'upload'
alter table public.job_photos add column if not exists lat double precision;
alter table public.job_photos add column if not exists lng double precision;
create index if not exists job_photos_qa_status_idx on public.job_photos (job_id, qa_status);

-- Job-card fields to match the tech iPad My Day (job #, type, ticket $). The iPad card shows
-- "104812 · Drain unclog · kitchen · $491" — these columns back that. Safe/idempotent.
-- Run in the Supabase SQL editor.

alter table public.jobs add column if not exists job_number text;   -- e.g. 104812
alter table public.jobs add column if not exists job_type   text;   -- e.g. "Drain unclog · kitchen"
alter table public.jobs add column if not exists amount     numeric default 0;  -- ticket $ (target to earn)

-- handy for "find a job by number" later
create index if not exists jobs_job_number on public.jobs (job_number);

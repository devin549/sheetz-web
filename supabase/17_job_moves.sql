-- Board move/activity audit — the live board rules require move history for reassign/reschedule.
-- Run ONCE in Supabase → SQL Editor. RLS on + no policies = server-only (service_role).

create table if not exists public.job_moves (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid,
  action         text,                 -- assign | reassign | unassign | reschedule
  from_tech_id   uuid,
  from_tech_name text,
  to_tech_id     uuid,
  to_tech_name   text,
  scheduled_at   timestamptz,
  by_email       text,
  created_at     timestamptz default now()
);
create index if not exists job_moves_job_idx     on public.job_moves (job_id);
create index if not exists job_moves_created_idx on public.job_moves (created_at desc);

alter table public.job_moves enable row level security;

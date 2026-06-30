-- 156 — rollover counters, so a job that keeps coming back can auto-flag as a multi-day PROJECT.
-- A parts return is a normal 2nd visit (not a project), so we track parts rolls separately and EXCLUDE them
-- from the project signal: project_signal = rollover_count - parts_rollovers. Idempotent.
alter table public.jobs
  add column if not exists rollover_count  int not null default 0,   -- every time the job is rolled
  add column if not exists parts_rollovers int not null default 0;   -- rolls that were "waiting on parts" (don't count toward project)

comment on column public.jobs.rollover_count is 'Total times this job has been rolled to another day.';
comment on column public.jobs.parts_rollovers is 'Rolls that were a parts wait (a normal 2nd visit) — excluded from the multi-day-project signal.';

-- 149 — Alert escalation stamp. A high-severity in-app task that sits OPEN past the threshold (aged or
-- re-fired repeatedly) and nobody claims gets pushed to the office ONCE; escalated_at records that so it
-- fires a single time, not every cron run. Without this a late/silent-tech alert just incremented seen_count
-- forever and could go all day unseen. Idempotent.
alter table public.tasks
  add column if not exists escalated_at timestamptz;

create index if not exists tasks_escalation_idx on public.tasks (priority, status, escalated_at)
  where status = 'open' and escalated_at is null;

comment on column public.tasks.escalated_at is 'When an unclaimed high-sev task was pushed to the office (#dispatch). NULL = not yet escalated.';

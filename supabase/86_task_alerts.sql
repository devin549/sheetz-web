-- P4 trigger/alert brain (audit #4). Turn the manual `tasks` list (migration 27) into the sink for
-- SYSTEM-generated alerts too: the named workflows (no-status, running-late, AR follow-up, on-call
-- unclaimed, low-margin, …) each create an in-app task FIRST; email/text is a later, opt-in escalation.
-- Additive + idempotent — the manual office task list keeps working unchanged.
alter table public.tasks add column if not exists source       text not null default 'manual';   -- manual | system
alter table public.tasks add column if not exists kind         text;        -- workflow key, e.g. 'no_status'
alter table public.tasks add column if not exists dedupe_key   text;        -- one open task per condition
alter table public.tasks add column if not exists entity       text;        -- job | customer | invoice | oncall | tech
alter table public.tasks add column if not exists entity_id    text;
alter table public.tasks add column if not exists meta         jsonb not null default '{}'::jsonb;
alter table public.tasks add column if not exists snooze_until  timestamptz;
alter table public.tasks add column if not exists seen_count   int not null default 1;            -- bumped each time the condition re-fires
alter table public.tasks add column if not exists last_seen_at timestamptz;
alter table public.tasks add column if not exists resolved_by  text;
alter table public.tasks add column if not exists resolution   text;

-- Allow snoozed/dismissed alongside the original open/done.
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('open', 'done', 'snoozed', 'dismissed'));

-- Dedupe: at most ONE non-terminal task per dedupe_key, so a cron that re-runs every few minutes bumps
-- the existing alert instead of spamming a new one. (createAlert also checks in code; this is the guard.)
create unique index if not exists tasks_dedupe_open_idx
  on public.tasks (dedupe_key)
  where dedupe_key is not null and status in ('open', 'snoozed');

create index if not exists tasks_source_kind_idx on public.tasks (source, kind, status);

-- Leak radar dispositions (audit #10). The margin-learning engine flags jobs that leak money
-- (underbilled / thin margin / padded parts / no receipt). It NEVER edits a job — a manager reviews each
-- flag and records what happened here. One row per job that's been actioned; un-actioned flags just don't
-- have a row yet. Full audit trail (who, when, why). Idempotent.
create table if not exists public.leak_reviews (
  job_id        text primary key,            -- jobs.id (uuid as text — matches how cb_comms stores it)
  status        text not null default 'open' check (status in ('open','dismissed','recovered','rebilled','coaching')),
  reason        text,                         -- the flag codes at review time, comma-joined
  leak_cents    bigint not null default 0,    -- engine's estimate at review time
  note          text,                         -- manager's note (why dismissed / how recovered)
  reviewed_by   uuid,
  reviewed_by_name text,
  reviewed_at   timestamptz not null default now()
);
create index if not exists leak_reviews_status_idx on public.leak_reviews (status);

alter table public.leak_reviews enable row level security;  -- server (service-role) only — financial data

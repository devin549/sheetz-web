-- On-call open-shift pickup + forced lottery (audit #6). A manager posts an open on-call shift with a
-- VOLUNTARY pickup bonus; the first tech to claim it gets the shift + the bonus. If nobody claims it, a
-- manager triggers a FORCED random pull — a random eligible tech is assigned with NO bonus. Full audit
-- trail (every post/claim/force logs). Idempotent.
create table if not exists public.oncall_offers (
  id              uuid primary key default gen_random_uuid(),
  label           text not null,                 -- "Weekend on-call · Jun 14-15"
  shift_date      date,
  bonus_cents     int not null default 0,         -- the voluntary-pickup bonus (NOT paid on a forced pull)
  status          text not null default 'open' check (status in ('open','claimed','forced','cancelled')),
  claimed_by      uuid,
  claimed_by_name text,
  claimed_at      timestamptz,
  forced          boolean not null default false, -- true = assigned by lottery, no bonus
  posted_by       uuid,
  posted_by_name  text,
  created_at      timestamptz not null default now()
);
create index if not exists oncall_offers_status_idx on public.oncall_offers (status, shift_date);

alter table public.oncall_offers enable row level security;  -- server (service-role) access only

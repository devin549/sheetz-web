-- Accepted estimates (Good/Better/Best price-book proposals) + the follow-up loop. The Estimate
-- builder already inserts here on accept; this table makes it persist and powers Open Estimates.
-- Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.proposals (
  id              text primary key,          -- PB-XXXXXX from the builder
  job_id          text,
  customer        text,
  is_member       boolean,
  tax_rate        numeric,
  status          text not null default 'open',
  recommended_key text,
  selected_key    text,
  accepted_total  numeric,
  tiers           jsonb,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  -- follow-up loop
  contacted_at    timestamptz,
  contact_count   int not null default 0,
  outcome         text check (outcome in ('won', 'lost')),
  outcome_at      timestamptz,
  outcome_by      text
);
create index if not exists proposals_open_idx on public.proposals (outcome, created_at desc);

-- RLS on, service-role only.
alter table public.proposals enable row level security;

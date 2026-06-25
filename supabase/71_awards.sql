-- Awards catalog — owner-managed. The owner adds / edits / deactivates awards + bounties + badges and
-- sets their value (the "totals" — $ payout and/or XP points). The tech gamification screens
-- (Races bounties, Vegas achievements) read the ACTIVE rows from here instead of hardcoded samples.
-- Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.awards (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  icon         text,                                       -- emoji shown on the badge/bounty
  kind         text not null default 'badge' check (kind in ('badge','bounty','weekly','recurring')),
  amount_cents bigint,                                     -- $ payout / bonus value (nullable)
  points       int,                                        -- XP / points value (nullable)
  description  text,
  active       boolean not null default true,
  sort         int not null default 0,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists awards_active_idx on public.awards (active, kind, sort);

alter table public.awards enable row level security;

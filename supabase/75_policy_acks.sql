-- Mandatory tech onboarding gate (ported from the Apps Script iPad: Monitoring Disclosure + Handbook +
-- NDA + roast-rating, with R requiring a separate timestamped re-consent). Every acceptance is recorded
-- with a server timestamp so there's an audit trail (mirrors the HTML's _DB_PolicyAcks). onboarded_at on
-- profiles is the fast "has this tech cleared the gate" flag. Idempotent. Run in the Supabase SQL editor.
create table if not exists public.policy_acks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  kind        text not null check (kind in ('monitoring','handbook','nda','roast_r')),
  version     text,
  initials    text,
  detail      jsonb not null default '{}'::jsonb,
  accepted_at timestamptz not null default now()
);
create index if not exists policy_acks_user_idx on public.policy_acks (user_id, kind, accepted_at desc);

alter table public.profiles add column if not exists onboarded_at timestamptz;

-- RLS on: all access is server-side via the service-role key (which bypasses RLS); the browser should
-- never read/write policy acks directly. No policies needed today.
alter table public.policy_acks enable row level security;

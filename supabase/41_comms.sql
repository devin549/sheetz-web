-- Customer comms log — every text/email we send (booking confirmations, ETA, reminders). Audit
-- trail for the no-auto-send rule: who sent what, to whom, when, and the provider result.
-- Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.cb_comms (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null default 'sms',     -- sms | email
  direction   text not null default 'out',
  to_addr     text,
  customer_id uuid,
  job_id      uuid,
  body        text,
  status      text not null default 'sent',     -- sent | failed | queued
  provider_id text,
  error       text,
  sent_by     text,
  created_at  timestamptz not null default now()
);
create index if not exists cb_comms_created_idx on public.cb_comms (created_at desc);
create index if not exists cb_comms_customer_idx on public.cb_comms (customer_id);

alter table public.cb_comms enable row level security;

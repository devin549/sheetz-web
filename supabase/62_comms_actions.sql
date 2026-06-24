-- Action-catching: when a tech texts "reschedule the Smith job 2 weeks to lay concrete", Hank parses it
-- into a PROPOSED action (it does NOT touch the schedule). A human taps Confirm to apply. Then a customer
-- notice is DRAFTED for approval (never auto-sent). One proposal per source message.
-- Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.comms_actions (
  id               uuid primary key default gen_random_uuid(),
  source_comms_id  uuid unique,                 -- the #sheetz message it came from (dedup)
  kind             text not null default 'reschedule',
  job_id           uuid,
  customer_name    text,
  tech_name        text,
  reason           text,
  days             int,
  old_date         timestamptz,
  new_date         timestamptz,
  summary          text,                         -- human-readable proposal line
  status           text not null default 'proposed',  -- proposed | applied | dismissed
  created_by       text default 'hank',
  applied_by       text,
  applied_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists comms_actions_status_idx on public.comms_actions (status, created_at desc);
alter table public.comms_actions enable row level security;

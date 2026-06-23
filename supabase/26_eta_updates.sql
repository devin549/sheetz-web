-- Running-Late ETA relay. The TECH reports a delay (structured event, no path to the customer);
-- the OFFICE sees it on the board and controls the customer message (call / text / acknowledge).
-- This honors the no-auto-send-to-customers rule: nothing reaches a customer without a human.
-- Idempotent. Run in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.job_eta_updates (
  id                uuid primary key default gen_random_uuid(),
  job_id            text not null,                 -- jobs.id (denormalized; no FK to dodge id-type coupling)
  minutes           int not null default 0,        -- how much later (e.g. 30)
  note              text,                          -- tech's note ("cable stuck, need 30 more min")
  needs_help        boolean not null default false,-- "Need office help" → ping dispatch, not the customer
  new_eta           timestamptz,                   -- client-computed new arrival (browser/Eastern)
  created_by        uuid,
  created_by_name   text,
  created_at        timestamptz not null default now(),
  ack_by            uuid,
  ack_by_name       text,
  ack_at            timestamptz,                   -- office acknowledged the report
  customer_notified boolean not null default false -- office sent the customer notice (call/text)
);
create index if not exists job_eta_updates_job_idx on public.job_eta_updates (job_id, created_at desc);
create index if not exists job_eta_updates_open_idx on public.job_eta_updates (created_at desc) where ack_at is null;

-- RLS on, NO policies by design: server (service-role) only.
alter table public.job_eta_updates enable row level security;

comment on table public.job_eta_updates is
'Tech-reported delays. The office controls any customer-facing message — nothing here auto-texts a customer.';

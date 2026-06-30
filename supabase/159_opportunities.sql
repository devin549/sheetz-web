-- 159 — Opportunities (win-back) engine. Money we recommended/quoted but didn't capture, tied to the customer
-- so we can follow up later. Source #1 = AI "Check my notes" recommendations the TECH flags for follow-up.
-- (Declined estimates + aging water heaters fold into the same board/audiences as live sources later.)
create extension if not exists pgcrypto;

create table if not exists public.opportunities (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null,
  job_id          uuid,
  kind            text not null default 'recommendation',  -- recommendation | declined_estimate | aging_water_heater
  source          text,                                    -- ai_work_summary | manual | ...
  title           text not null,                           -- the recommended service ("Hydro-jet the kitchen line")
  detail          text,                                    -- the why / context
  est_value_cents bigint,                                  -- optional ballpark value
  status          text not null default 'open',            -- open | sent | won | dismissed
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  sent_at         timestamptz,
  won_at          timestamptz,
  dismissed_at    timestamptz,
  dismissed_reason text
);
create index if not exists opportunities_cust_idx   on public.opportunities (customer_id, status);
create index if not exists opportunities_status_idx on public.opportunities (status, created_at desc);
create index if not exists opportunities_job_idx    on public.opportunities (job_id);
alter table public.opportunities enable row level security;

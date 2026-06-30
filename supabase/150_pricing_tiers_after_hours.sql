-- 150 — Structured pricing: service tiers (manual urgency adds) + automatic after-hours markup. ONE pricebook,
-- no duplicate book — the markup is computed, not a second price list. Owner-editable. Idempotent.

-- Manual per-job urgency tier (tech/office picks one). Flat $ adds.
create table if not exists public.service_tiers (
  key             text primary key,                 -- 'standard' | 'priority' | 'emergency'
  label           text not null,
  surcharge_cents bigint not null default 0,
  sort            int not null default 0,
  active          boolean not null default true
);
insert into public.service_tiers (key, label, surcharge_cents, sort) values
  ('standard',  'Standard service',         2500, 1),
  ('priority',  'Priority — same-day',      4500, 2),
  ('emergency', 'Emergency — after-hours',  6500, 3)
on conflict (key) do nothing;

-- After-hours auto-markup (single-row config). % applied to the work when the JOB is after-hours.
create table if not exists public.pricing_settings (
  id                    int primary key default 1,
  after_hours_pct       numeric not null default 10,    -- % markup
  after_hours_from_hour int not null default 19,         -- 7pm, 24h, America/New_York
  after_hours_weekend   boolean not null default true,   -- Sat/Sun all day
  active                boolean not null default true,
  updated_at            timestamptz not null default now(),
  constraint pricing_settings_singleton check (id = 1)
);
insert into public.pricing_settings (id) values (1) on conflict (id) do nothing;

-- Per-job override of the auto rule: NULL = auto (by scheduled time), true = force after-hours, false = force off.
alter table public.jobs add column if not exists after_hours boolean;

comment on table public.service_tiers is 'Manual per-job urgency tier surcharges (Standard/Priority/Emergency). Owner-editable.';
comment on table public.pricing_settings is 'After-hours auto-markup config (single row). ONE pricebook + computed markup, never a duplicate book.';
comment on column public.jobs.after_hours is 'After-hours override: NULL=auto by scheduled time, true=force on, false=force off.';

-- Real Clog Busterz pay STRUCTURE (the 2-week breakdown) + the per-job inputs it needs.
-- Per-tech pay TYPE + rate already live in pay_profiles (commission | hourly | hourly_comm | salary).
-- This adds: (1) the company pay-structure constants (editable, and you can add more structures),
-- (2) per-job material cost + dispatch fee so the formula has real inputs. Idempotent.
create extension if not exists pgcrypto;

-- Per-job financial inputs (cents). Revenue = jobs.amount. Material cost + dispatch fee drive the
-- commission math. Default 0 → until entered, material deduction is 0 (flagged in the UI).
alter table public.jobs add column if not exists material_cost_cents bigint not null default 0;
alter table public.jobs add column if not exists dispatch_fee_cents   bigint not null default 0;

-- Named pay structures. 'cb' = the real Clog Busterz structure. Add rows for alternates.
-- Formula (verbatim from the Tech Sheet): per job —
--   markup   = material_cost <= threshold ? markup_low : markup_high     (2x ≤ $399, else 1.5x)
--   premium% = material_cost <= threshold ? premium_low : premium_high   (10% ≤ $399, else 5%)
--   material_marked_up = material_cost × markup
--   subtotal   = revenue − min(dispatch_fee, dispatch_fee_cap) − material_marked_up
--   commission = max(0, subtotal) × (tech commission_pct / 100)
--   premium    = material_marked_up × (premium% / 100)
--   job pay    = commission + premium
-- Hourly base is PTO/holiday ONLY for commission techs (never stacked on job time).
create table if not exists public.pay_structures (
  name                  text primary key,
  label                 text,
  dispatch_fee_cap_cents bigint not null default 12500,   -- $125/job cap
  material_threshold_cents bigint not null default 39900,  -- $399
  markup_low            numeric not null default 2.0,      -- material ≤ threshold
  markup_high           numeric not null default 1.5,      -- material > threshold
  premium_low_pct       numeric not null default 10,       -- material ≤ threshold
  premium_high_pct      numeric not null default 5,        -- material > threshold
  default_commission_pct numeric not null default 0,       -- fallback if a tech has no rate set
  updated_at            timestamptz not null default now()
);
insert into public.pay_structures (name, label) values ('cb', 'Clog Busterz (default)')
on conflict (name) do nothing;

-- Which structure a tech's pay uses (defaults to 'cb'). pay_profiles already holds pay_type + rate.
alter table public.pay_profiles add column if not exists structure text not null default 'cb';

alter table public.pay_structures enable row level security;

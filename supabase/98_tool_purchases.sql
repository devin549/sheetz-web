-- Tool purchase / payroll-payoff plans. Company buys a tool (often off a receipt), it's COMPANY PROPERTY,
-- and a weekly payroll deduction (a % of tool value) chips away at it. If the tech is fired/quits before
-- payoff: refund what they've paid, company keeps the tool. Paid off in full: ownership transfers to the tech.
-- Additive, idempotent, RLS-locked. Money in cents.
create extension if not exists pgcrypto;

create table if not exists public.tool_purchases (
  id              uuid primary key default gen_random_uuid(),
  tool_id         uuid,                       -- links to public.tools (nullable; receipt may arrive first)
  tool_name       text,
  tech_name       text,                       -- who's buying it down
  tech_id         uuid,
  purchase_cents  bigint not null default 0,  -- total tool value
  weekly_pct      numeric not null default 10, -- 5–10% of value per week
  weekly_cents    bigint not null default 0,  -- the actual weekly deduction (derived from pct)
  paid_cents      bigint not null default 0,  -- running total paid down
  vendor          text,
  receipt_path    text,                       -- the receipt photo backing the purchase
  status          text not null default 'active' check (status in ('active','paid_off','closed')),
  started_on      date not null default current_date,
  closed_on       timestamptz,
  closed_reason   text,                       -- 'separated' (fired/quit) etc.
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists tool_purchases_tech_idx   on public.tool_purchases (tech_name, status);
create index if not exists tool_purchases_status_idx on public.tool_purchases (status, started_on);
alter table public.tool_purchases enable row level security;

create table if not exists public.tool_payments (
  id              uuid primary key default gen_random_uuid(),
  purchase_id     uuid not null,
  tech_name       text,
  amount_cents    bigint not null default 0,  -- deduction toward payoff, or amount refunded
  kind            text not null default 'deduction' check (kind in ('deduction','refund','adjustment')),
  week_of         date not null default current_date,
  note            text,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists tool_payments_purchase_idx on public.tool_payments (purchase_id, week_of desc);
-- One deduction per plan per week (refunds/adjustments exempt) — guards against double-posting payroll.
create unique index if not exists tool_payments_week_uniq on public.tool_payments (purchase_id, week_of) where kind = 'deduction';
alter table public.tool_payments enable row level security;

-- Mark tools as company property + link the active payoff plan.
alter table public.tools add column if not exists company_owned boolean default true;
alter table public.tools add column if not exists purchase_id   uuid;

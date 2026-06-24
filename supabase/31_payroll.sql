-- Payroll: per-tech pay config + weekly runs with an APPROVAL GATE. A run is a DRAFT until an
-- approver signs off; nothing here ever sends pay — export to the payroll file is a separate,
-- deliberate step (the no-auto-send rule). CB week = Sun→Sat. Idempotent. Run in the SQL editor.
create extension if not exists pgcrypto;

-- Per-tech pay configuration. Commission techs get commission ONLY (hourly is vacation/holiday pay,
-- never stacked on job pay) — the app enforces that from pay_type.
create table if not exists public.pay_profiles (
  tech_id        uuid primary key references public.techs(id) on delete cascade,
  pay_type       text not null default 'commission' check (pay_type in ('commission', 'hourly', 'hourly_comm', 'salary')),
  commission_pct numeric not null default 0,    -- e.g. 22  (= 22%)
  hourly_rate    numeric not null default 0,
  weekly_salary  numeric not null default 0,
  updated_at     timestamptz not null default now()
);

-- A weekly payroll run (one per Sun→Sat week).
create table if not exists public.cb_payroll_runs (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null unique,
  week_end    date not null,
  status      text not null default 'draft' check (status in ('draft', 'approved')),
  created_by  text,
  created_at  timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz
);

-- Per-tech line in a run. Money in CENTS to avoid float drift. Gross is computed in the app from
-- pay_type so the rule (commission-only vs hourly) is always applied.
create table if not exists public.cb_payroll_lines (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references public.cb_payroll_runs(id) on delete cascade,
  tech_id          uuid,
  tech_name        text,
  pay_type         text,
  jobs_count       int  not null default 0,
  revenue_cents    bigint not null default 0,
  commission_cents bigint not null default 0,   -- computed: commission_pct% of revenue
  hours            numeric not null default 0,   -- manual (web doesn't track hours yet)
  hourly_cents     bigint not null default 0,    -- computed from hours × rate
  bonus_cents      bigint not null default 0,    -- awards (Crown/Turd/HHWP…) — manual
  adjust_cents     bigint not null default 0,    -- approver +/- (callbacks, holds, doc-fraud fee)
  note             text,
  created_at       timestamptz not null default now()
);
create index if not exists cb_payroll_lines_run_idx on public.cb_payroll_lines (run_id);

-- RLS on, service-role only (the server gates by role + the approval flow).
alter table public.pay_profiles enable row level security;
alter table public.cb_payroll_runs enable row level security;
alter table public.cb_payroll_lines enable row level security;

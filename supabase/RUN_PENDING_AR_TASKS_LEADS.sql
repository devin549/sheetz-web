-- Pending tables paste — run once in Supabase SQL Editor. Idempotent.

-- ===== 12_ar_activity.sql =====
-- AR activity ledger — the "accounting bot keeping track". Every mark-paid (and later: payments,
-- statements sent, dunning) is recorded here: who did what, to whom, for how much, when. This is the
-- audit trail the books bot watches + reports on. Idempotent. Run in the Supabase SQL editor.

create table if not exists public.ar_activity (
  id             uuid primary key default gen_random_uuid(),
  action         text not null,          -- 'invoice_paid' | 'customer_paid'
  customer_id    uuid,
  customer_name  text,
  invoice_id     uuid,
  invoice_number text,
  amount         numeric,
  by_email       text,                   -- stamped server-side
  created_at     timestamptz not null default now()
);
create index if not exists ar_activity_created on public.ar_activity (created_at desc);
alter table public.ar_activity enable row level security;

-- ===== 27_tasks.sql =====
-- Office/field task list (Reports & Tasks → Tasks). Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  detail     text,
  assignee   text,                 -- free text name/email for now
  due_date   date,
  priority   text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status     text not null default 'open' check (status in ('open', 'done')),
  created_by text,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index if not exists tasks_open_idx on public.tasks (status, due_date, created_at desc);

-- RLS on, service-role only (the server gates by role).
alter table public.tasks enable row level security;

-- ===== 28_web_leads.sql =====
-- Web Leads inbox (Booking & Intake). Inbound leads from the website / forms land here; the office
-- works them and books the good ones. Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.web_leads (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  phone       text,
  email       text,
  address     text,
  service     text,                 -- what they need
  message     text,                 -- free-text from the form
  source      text not null default 'web',
  status      text not null default 'new' check (status in ('new', 'contacted', 'booked', 'dead')),
  customer_id uuid,                  -- set when matched/created
  job_id      uuid,                  -- set when booked
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists web_leads_status_idx on public.web_leads (status, created_at desc);

-- RLS on, service-role only.
alter table public.web_leads enable row level security;

-- ===== 29_receipts.sql =====
-- Receipt review entries — Accounting works the receipt PHOTOS techs upload on jobs (job_photos
-- where kind='receipt'). One entry per receipt photo: vendor + amount + category + verify/flag.
-- REQUIRES supabase/23_job_photo_spine.sql (job_photos). Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.receipt_entries (
  id              uuid primary key default gen_random_uuid(),
  photo_id        uuid not null unique references public.job_photos(id) on delete cascade,
  job_id          text,
  vendor          text,
  amount_cents    int,
  category        text,             -- materials / fuel / tools / permit / other
  status          text not null default 'pending' check (status in ('pending', 'verified', 'flagged')),
  note            text,
  reviewed_by     uuid,
  reviewed_by_name text,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists receipt_entries_status_idx on public.receipt_entries (status, created_at desc);

-- RLS on, service-role only.
alter table public.receipt_entries enable row level security;

-- ===== 30_proposals.sql =====
-- Accepted estimates (Good/Better/Best price-book proposals) + the follow-up loop. The Estimate
-- builder already inserts here on accept; this table makes it persist and powers Open Estimates.
-- Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.proposals (
  id              text primary key,          -- PB-XXXXXX from the builder
  job_id          text,
  customer        text,
  is_member       boolean,
  tax_rate        numeric,
  status          text not null default 'open',
  recommended_key text,
  selected_key    text,
  accepted_total  numeric,
  tiers           jsonb,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  -- follow-up loop
  contacted_at    timestamptz,
  contact_count   int not null default 0,
  outcome         text check (outcome in ('won', 'lost')),
  outcome_at      timestamptz,
  outcome_by      text
);
create index if not exists proposals_open_idx on public.proposals (outcome, created_at desc);

-- RLS on, service-role only.
alter table public.proposals enable row level security;

-- ===== 31_payroll.sql =====
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

-- ===== 32_doc_fraud.sql =====
-- Doc-fraud cases: claimed materials with no produced/verified receipt → strip the claim + a fee.
-- The fee is applied as a NEGATIVE adjust on a DRAFT payroll line (never a silent deduction; it's
-- reviewed before the run is approved — "pay HELD not deducted"). Idempotent. Run in the SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.doc_fraud_cases (
  id             uuid primary key default gen_random_uuid(),
  tech_id        uuid,
  tech_name      text,
  job_id         text,
  photo_id       uuid,                  -- the flagged receipt this came from (optional)
  claimed_cents  bigint not null default 0,   -- material claim being stripped
  fee_cents      bigint not null default 0,   -- the doc-fraud fee
  reason         text,
  status         text not null default 'open' check (status in ('open', 'applied', 'absolved')),
  created_by     text,
  created_at     timestamptz not null default now(),
  resolved_by    text,
  resolved_at    timestamptz,
  payroll_run_id uuid                    -- set when the fee is applied to a payroll draft
);
create index if not exists doc_fraud_status_idx on public.doc_fraud_cases (status, created_at desc);

-- RLS on, service-role only.
alter table public.doc_fraud_cases enable row level security;

-- ===== 33_cash_custody.sql =====
-- Cash custody chain: track cash a tech collects from collection → turned in to office → deposited.
-- Outstanding (collected, not turned in) = the theft-risk exposure. Idempotent. Run in the SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.cash_custody (
  id            uuid primary key default gen_random_uuid(),
  tech_id       uuid,
  tech_name     text,
  job_id        text,
  customer      text,
  amount_cents  bigint not null default 0,
  status        text not null default 'collected' check (status in ('collected', 'turned_in', 'deposited', 'missing')),
  collected_at  timestamptz not null default now(),
  collected_by  text,
  received_by   text,
  received_at   timestamptz,
  deposit_ref   text,
  deposited_at  timestamptz,
  note          text
);
create index if not exists cash_custody_status_idx on public.cash_custody (status, collected_at desc);

-- RLS on, service-role only.
alter table public.cash_custody enable row level security;

-- ===== 34_goals.sql =====
-- Office goals/targets — the numbers the board's Office Targets gauges + Game Plan missions measure
-- against. Editable on /settings. Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.office_goals (
  key        text primary key,
  label      text not null,
  target     numeric not null default 0,
  unit       text not null default 'count',   -- 'dollars' | 'count'
  assignee   text,
  sort       int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.office_goals (key, label, target, unit, assignee, sort) values
  ('booked_day',     'Booked today',      18000, 'dollars', 'Owner',      1),
  ('avg_ticket',     'Avg ticket',          750, 'dollars', 'Sales',      2),
  ('qa_clear',       'Clear QA holds',        0, 'count',   'Supervisor', 3),
  ('ar_collect_week','Collect AR (week)',  25000, 'dollars', 'Accounting', 4),
  ('calls_day',      'Calls booked',         25, 'count',   'CSRs',       5),
  ('reviews_week',   'New reviews (week)',   10, 'count',   'CSRs',       6),
  ('same_day_fills', 'Same-day fills',        5, 'count',   'Dispatch',   7)
on conflict (key) do nothing;

-- RLS on, service-role only.
alter table public.office_goals enable row level security;

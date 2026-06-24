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

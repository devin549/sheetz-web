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

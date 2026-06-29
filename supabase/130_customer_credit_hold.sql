-- 🚦 Credit hold — stop new work for a customer until AR is cleared / terms are signed.
-- Run ONCE in Supabase → SQL Editor. Append-only; safe to re-run.
alter table public.customers
  add column if not exists credit_hold        boolean not null default false,
  add column if not exists credit_hold_reason text,
  add column if not exists credit_hold_at     timestamptz,
  add column if not exists credit_hold_by     text;

create index if not exists customers_credit_hold_idx on public.customers (credit_hold) where credit_hold;

-- Bank Position — manually-tracked account balances for the owner cash dashboard. The app pairs
-- these with live AR (open invoices) + cash-in-transit (cash_custody) to show the real position.
-- Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.bank_accounts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          text not null default 'checking',  -- checking | savings | cash | credit
  balance_cents bigint not null default 0,          -- credit kind is money OWED (shown separately)
  as_of         date not null default current_date,
  note          text,
  sort          int not null default 0,
  updated_at    timestamptz not null default now(),
  updated_by    text
);
create index if not exists bank_accounts_sort_idx on public.bank_accounts (sort);

-- RLS on, service-role only.
alter table public.bank_accounts enable row level security;

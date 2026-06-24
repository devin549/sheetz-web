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

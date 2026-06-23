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

-- Per-customer A/R notes — the "Notes" column Ashley keeps in her AR report
-- (e.g. "Sent to Attorney 4/22", "DO NOT SERVICE", "Pays Weekly", "Retainage"). Run ONCE.
-- One note per customer (upsert on customer_id). RLS on + no policies = server-only.

create table if not exists public.ar_notes (
  customer_id uuid primary key,
  note        text,
  updated_by  text,
  updated_at  timestamptz default now()
);

alter table public.ar_notes enable row level security;

-- Email send counter — one row per email actually sent (campaign, statement, or test), so we can
-- show usage vs the Resend plan cap and alert before it's hit. Run ONCE in Supabase → SQL Editor.

create table if not exists public.email_events (
  id         uuid primary key default gen_random_uuid(),
  to_email   text,
  created_at timestamptz default now()
);
create index if not exists email_events_created_idx on public.email_events (created_at desc);

alter table public.email_events enable row level security;

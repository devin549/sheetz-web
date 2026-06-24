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

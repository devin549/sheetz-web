-- Memberships — customers enrolled in recurring service plans (the predictable-revenue book).
-- Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid,                                -- optional link to customers (no hard FK — base may differ)
  customer    text not null,                       -- denormalized name for display
  plan        text not null,
  status      text not null default 'active',      -- active | paused | cancelled
  price_cents integer not null default 0,
  period      text not null default 'year',        -- 'month' | 'year' (billing cadence)
  started_on  date not null default current_date,
  renews_on   date,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  text,
  updated_at  timestamptz not null default now()
);
create index if not exists memberships_status_idx on public.memberships (status);
create index if not exists memberships_customer_idx on public.memberships (customer_id);

-- RLS on, service-role only (the app reads/writes through the service key, never the browser).
alter table public.memberships enable row level security;

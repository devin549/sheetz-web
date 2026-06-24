-- Competitor pricing radar — price points mined from competitor Google reviews (e.g. "$3400 water
-- heater install, 5★"), so CB can see where it sits vs the market. Idempotent.
create extension if not exists pgcrypto;

create table if not exists public.competitor_pricing (
  id          uuid primary key default gen_random_uuid(),
  competitor  text not null,
  service     text,
  price_cents bigint,
  rating      numeric,
  quote       text,
  location    text,
  source      text default 'google_review',
  scanned_at  timestamptz not null default now(),
  scanned_by  text
);
create index if not exists competitor_pricing_scan_idx on public.competitor_pricing (scanned_at desc);
create index if not exists competitor_pricing_comp_idx on public.competitor_pricing (competitor);

alter table public.competitor_pricing enable row level security;

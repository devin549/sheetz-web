-- Review intelligence — periodic snapshots of every plumber's star rating + review count per town (from
-- the local pack via SerpAPI), so we can benchmark Clog Busterz vs the competition and watch momentum
-- (who's gaining reviews fastest). Time-series; one row per business per scan. RLS-locked.
create extension if not exists pgcrypto;

create table if not exists public.competitor_snapshots (
  id            uuid primary key default gen_random_uuid(),
  business_name text not null,
  town          text not null,
  rating        numeric,
  reviews       int,
  is_us         boolean not null default false,   -- true = the Clog Busterz listing
  captured_at   timestamptz not null default now()
);
create index if not exists competitor_snapshots_idx on public.competitor_snapshots (town, business_name, captured_at desc);
create index if not exists competitor_snapshots_day_idx on public.competitor_snapshots (captured_at desc);
alter table public.competitor_snapshots enable row level security;

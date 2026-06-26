-- Local rank tracker — where Clog Busterz shows in the Google local pack for each service keyword × town.
-- Populated by SerpAPI (google_local) on a weekly cron. Powers the "are we showing up?" grid (Richmond vs
-- Lexington is Devin's #1 growth lever). RLS-locked.
create extension if not exists pgcrypto;

create table if not exists public.rank_checks (
  id           uuid primary key default gen_random_uuid(),
  keyword      text not null,
  location     text not null,
  position     int,                      -- 1..N in the local pack; null = not found
  found        boolean not null default false,
  total_shown  int,
  competitors  jsonb not null default '[]'::jsonb,   -- [{name, rating, reviews, position}]
  checked_at   timestamptz not null default now()
);
create index if not exists rank_checks_kw_idx on public.rank_checks (keyword, location, checked_at desc);
create index if not exists rank_checks_day_idx on public.rank_checks (checked_at desc);
alter table public.rank_checks enable row level security;

-- Commercial lead finder — B2B prospects pulled from Google Maps (apartments, property mgmt, restaurants,
-- HOAs…) the office can work as plumbing accounts. Dedupe on name+address. RLS-locked.
create extension if not exists pgcrypto;

create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  category         text,                 -- the search bucket (apartments, property management, …)
  address          text,
  phone            text,
  website          text,
  rating           numeric,
  reviews          int,
  place_id         text,
  location_searched text,
  status           text not null default 'new' check (status in ('new','contacted','qualified','won','dead')),
  notes            text,
  claimed_by       text,
  source           text not null default 'serp',
  created_by       uuid,
  created_by_name  text,
  created_at       timestamptz not null default now()
);
create unique index if not exists leads_dedupe_idx on public.leads (lower(name), lower(coalesce(address, '')));
create index if not exists leads_status_idx on public.leads (status, created_at desc);
alter table public.leads enable row level security;

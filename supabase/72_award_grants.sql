-- Per-tech award grants / adjustments. The owner credits (or docks) an individual tech — either by
-- granting a catalog award or a manual +/- amount + points + note. Vegas XP sums points from here.
-- Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.award_grants (
  id           uuid primary key default gen_random_uuid(),
  tech_id      text,
  tech_name    text,
  award_id     uuid references public.awards(id) on delete set null,
  title        text,
  amount_cents bigint,                 -- may be negative to dock
  points       int,                    -- may be negative to dock
  note         text,
  granted_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists award_grants_tech_idx on public.award_grants (tech_name, created_at desc);
create index if not exists award_grants_techid_idx on public.award_grants (tech_id, created_at desc);

alter table public.award_grants enable row level security;

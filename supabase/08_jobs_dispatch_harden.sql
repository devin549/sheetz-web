-- Phase 1 keystone: harden the jobs table for the dispatch board + tech status flow.
-- The board needs tech assignment, GPS, and status timestamps; the status CHECK also has to
-- allow the en-route states the seed + iPad use. Idempotent — safe to re-run.
-- Run in the Supabase SQL editor.

-- ── board / assignment / status-flow columns ──────────────────────────────
alter table public.jobs add column if not exists tech_email    text;
alter table public.jobs add column if not exists tech_name     text;     -- denormalized for fast board reads
alter table public.jobs add column if not exists assigned_at   timestamptz;
alter table public.jobs add column if not exists enroute_at    timestamptz;
alter table public.jobs add column if not exists started_at    timestamptz;   -- on-site
alter table public.jobs add column if not exists completed_at  timestamptz;
alter table public.jobs add column if not exists lat           numeric;
alter table public.jobs add column if not exists lng           numeric;
alter table public.jobs add column if not exists address       text;
alter table public.jobs add column if not exists city          text;
alter table public.jobs add column if not exists business_unit text;
alter table public.jobs add column if not exists updated_at    timestamptz default now();

-- ── broaden the status CHECK ───────────────────────────────────────────────
-- Was: (scheduled, on_site, done, cancelled) — which REJECTS 'enroute' that seed.sql inserts.
-- Add the en-route + hold states the board/iPad use.
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status in ('scheduled','enroute','on_my_way','on_site','done','cancelled','hold'));

-- ── indexes for the board's hot queries ────────────────────────────────────
create index if not exists jobs_scheduled_at on public.jobs (scheduled_at);
create index if not exists jobs_tech_email    on public.jobs (tech_email);
create index if not exists jobs_status        on public.jobs (status);

-- Tech Start-of-Day / End-of-Day shift log. One row per tech per day per kind (sod|eod). Records the
-- checklist they completed, auto-detected flags (missing tools / failed QA / unresolved jobs), the
-- "ready" state, and any office notes. Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.tech_shift_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  tech_id    text,
  name       text,
  day_key    text not null,                              -- YYYY-MM-DD (Eastern)
  kind       text not null check (kind in ('sod','eod')),
  checklist  jsonb not null default '{}'::jsonb,         -- { key: true/false }
  flags      jsonb not null default '{}'::jsonb,         -- auto-detected issues snapshot
  ready      boolean not null default false,
  notes      text,
  created_at timestamptz not null default now(),
  unique (user_id, day_key, kind)
);
create index if not exists tech_shift_log_day_idx on public.tech_shift_log (day_key, kind);

alter table public.tech_shift_log enable row level security;

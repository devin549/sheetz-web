-- On-call rotation. OM/GM sets the week (Mon–Thu nights + the weekend + helper/supervisor of the week);
-- the app auto-posts to #sheetz at 4:30pm ET (on-call starts at 5) — Friday names the weekend.
-- Single "current" row, overwritten each week. Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.on_call_schedule (
  id           uuid primary key default gen_random_uuid(),
  slot         text unique not null default 'current',
  mon          text,
  tue          text,
  wed          text,
  thu          text,
  weekend      text,
  helper_week  text,
  supervisor   text,
  week_label   text,
  set_by       text,
  updated_at   timestamptz not null default now()
);
alter table public.on_call_schedule enable row level security;

-- Helper ↔ tech daily pairings — the web-app home for the live _DB_HelperAssign sheet
-- (CB_Dispatch_Helper_v1). A helper rides along on a tech for a day; their "My Day" shows
-- that PAIRED TECH's jobs (read-only, no pricing/commission/payment). The office (gm/om/
-- dispatcher/csr/fs/lead) writes a pairing per helper per day.
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.

create table if not exists public.helper_assignments (
  id            uuid primary key default gen_random_uuid(),
  date_key      date        not null,                    -- the day this pairing is for
  helper_email  text        not null,
  helper_name   text,
  tech_email    text        not null,
  tech_name     text,
  window        text,                                    -- e.g. "8:00am-4:00pm"
  assigned_by   text,                                    -- stamped server-side, never client
  created_at    timestamptz not null default now()
);

-- one active pairing per helper per day (office can re-pair → upsert on this key)
create unique index if not exists helper_assignments_helper_day
  on public.helper_assignments (date_key, lower(helper_email));

create index if not exists helper_assignments_date
  on public.helper_assignments (date_key);

-- RLS on — reads/writes go through the server-side service_role (same pattern as the rest).
alter table public.helper_assignments enable row level security;

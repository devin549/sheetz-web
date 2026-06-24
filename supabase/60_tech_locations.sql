-- Live tech GPS so Hank can rank "closest tech" by true distance (not just current-job address).
-- Fed two ways: the web My Day "Share location" button, and an ingest endpoint the field app POSTs to.
-- One row per tech (latest fix). Idempotent. Run in the Supabase SQL editor.
create table if not exists public.tech_locations (
  tech_name   text primary key,
  tech_id     uuid,
  lat         double precision,
  lng         double precision,
  accuracy_m  double precision,
  source      text default 'web',          -- web | field-app
  updated_at  timestamptz not null default now()
);
alter table public.tech_locations enable row level security;

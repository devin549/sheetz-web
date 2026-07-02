-- 168 — a tiny generic key/value cache (JSON + updated_at). First user: supplier open-hours from the
-- SerpAPI Maps engine (lib/serpExtra.js) — weekly store hours are stable, so caching them 3 days turns
-- "4 searches per page view" into "4 searches every 3 days". Reusable for any other cheap server cache.
-- Fail-soft everywhere: code treats a missing table as a cache miss, never an error.
create table if not exists public.kv_cache (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);
alter table public.kv_cache enable row level security;  -- service-role only, like the rest of the schema

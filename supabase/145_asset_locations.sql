-- 145 — Chat-learned asset locations (STOPGAP until the real inventory/asset system is live). The crew
-- already logs where things are in #general ("17G ready for pickup at 2501 Mansion View Ct" → "picked up
-- and dropped at 426 E Broadway"). Captain Hook reads those, and Claude pulls out what/where/who so Hank can
-- answer "where's the 17G?" from the latest line. ANYTHING with a location: machines, tools, keys, materials.
-- Idempotent. Retire this when the live asset tracker ships.
create extension if not exists pgcrypto;

create table if not exists public.asset_locations (
  id           uuid primary key default gen_random_uuid(),
  asset        text not null,             -- as said: "17G", "mini excavator", "storage building key", "3/4 copper"
  asset_key    text not null,             -- normalized for lookup (lowercased/trimmed/de-spaced)
  kind         text,                      -- 'equipment' | 'tool' | 'key' | 'material' | 'other'
  action       text,                      -- 'ready_pickup' | 'picked_up' | 'dropped' | 'has' | 'returned' | 'moved'
  location     text,                      -- free-text place/address exactly as posted
  holder       text,                      -- who has / last moved it (nullable)
  by_name      text,                      -- who posted the update
  source       text default 'discord:general',
  provider_id  text,                      -- Discord message id (a message can yield several rows → not unique)
  created_at   timestamptz not null default now()
);

-- "latest known location per asset" = newest row per asset_key. Also lets us skip already-processed messages.
create index if not exists asset_locations_key_idx on public.asset_locations (asset_key, created_at desc);
create index if not exists asset_locations_provider_idx on public.asset_locations (provider_id);

comment on table public.asset_locations is 'STOPGAP chat-learned asset locations from #general (machines/tools/keys/materials). Retire when the live asset tracker ships.';

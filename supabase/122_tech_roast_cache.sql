-- 122 — Daily AI-roast cache. The Corn/Turd roast is generated ONLY when a tech opens the Races screen,
-- then cached for the day keyed to (tech · race · rank · level). Re-opening the tab = a cache hit = ZERO
-- tokens. A new day or a rank change is the only thing that triggers a fresh generation. Keeps the AI
-- budget tiny (~one call per tech per race per day, not "all day for a screen nobody's looking at").
create table if not exists public.tech_roast_cache (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  day_key    text not null,            -- YYYY-MM-DD in CB's timezone
  race       text not null,            -- revenue | review | hhwp
  rank       integer not null,
  level      text not null,            -- PG | PG-13 | R (what the tech agreed to in setup)
  text       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, day_key, race, rank, level)
);
alter table public.tech_roast_cache enable row level security;

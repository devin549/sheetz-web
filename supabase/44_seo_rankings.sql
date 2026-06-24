-- SEO rank scans — where Clog Busterz ranks for core plumbing keywords per market (via SerpAPI).
-- Each "Run scan" inserts one row per keyword×location, so history builds for trend. Idempotent.
create extension if not exists pgcrypto;

create table if not exists public.seo_rankings (
  id            uuid primary key default gen_random_uuid(),
  keyword       text not null,
  location      text not null,
  cb_rank       int,                 -- organic position (null = not found in top results)
  cb_in_local   boolean default false,  -- present in the Google local/map pack
  top_results   jsonb,               -- [{rank,title,domain}] organic competitors above/around us
  local_results jsonb,               -- [{name,rating}] local-pack competitors
  scanned_at    timestamptz not null default now(),
  scanned_by    text
);
create index if not exists seo_rankings_scan_idx on public.seo_rankings (scanned_at desc);
create index if not exists seo_rankings_kw_idx on public.seo_rankings (keyword, location, scanned_at desc);

alter table public.seo_rankings enable row level security;

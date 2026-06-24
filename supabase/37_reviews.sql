-- Reviews — customer reviews log (manual entry now; a feed can write here later). Columns match
-- what the collaborator-audit route already reads (customer_name, rating, text, source, tech_name).
-- Low ratings (≤3) drive Customer Recovery. Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  customer_name text,
  rating        int not null default 5,           -- 1..5
  text          text,
  source        text default 'Google',            -- Google | Facebook | Yelp | Other
  tech_name     text,
  job_id        uuid,
  responded     boolean not null default false,   -- recovery handled (for ≤3 star)
  responded_by  text,
  responded_at  timestamptz,
  created_at    timestamptz not null default now(),
  created_by    text
);
create index if not exists reviews_created_idx on public.reviews (created_at desc);
create index if not exists reviews_rating_idx on public.reviews (rating);

-- RLS on, service-role only.
alter table public.reviews enable row level security;

-- 128 — AI-seeded cross-sell recommendations ("commonly added with this", before real job data exists).
-- These are STARTER picks: the catalog drawer blends them UNDER genuinely-learned co-occurrence
-- (job_pricebook_usage) so learned-from-real-jobs always wins; AI rows just keep the section from being
-- empty pre-launch. Owner re-runs the seeder anytime; rows are tagged so we can tell AI from learned.
create table if not exists public.pricebook_recommendations (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.pricebook_items(id) on delete cascade,
  rec_item_id  uuid not null references public.pricebook_items(id) on delete cascade,
  source       text not null default 'ai',     -- 'ai' = Claude-seeded; reserved for future 'owner' pins
  score        integer not null default 0,      -- rank hint (higher = stronger pairing)
  created_at   timestamptz not null default now(),
  unique (item_id, rec_item_id),
  check (item_id <> rec_item_id)
);
create index if not exists pricebook_recommendations_item_idx on public.pricebook_recommendations (item_id);
alter table public.pricebook_recommendations enable row level security;

-- Tombstone: which items the AI seeder has ALREADY tried (pass OR no-pick). The seeder skips these on re-run
-- so it never re-spends on an item with no good pairing, and the "to seed" count can actually reach zero.
-- Delete a row here to let the seeder retry that item.
create table if not exists public.pricebook_rec_seeded (
  item_id      uuid primary key references public.pricebook_items(id) on delete cascade,
  picks        integer not null default 0,   -- how many recs it produced (0 = no good pairing found)
  attempted_at timestamptz not null default now()
);
alter table public.pricebook_rec_seeded enable row level security;

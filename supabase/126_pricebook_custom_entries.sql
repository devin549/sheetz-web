-- 126 — Always-Learning Loop: tech custom pricebook entries (Phase 2b-ii).
--
-- When a tech does an odd job that's NOT in the catalog they type a CUSTOM ENTRY (name + what they did + a
-- ONE-OFF price for THIS job). That custom line sells as an ad-hoc line on the estimate — it creates NO
-- catalog item and changes NO catalog price. Every entry is RECORDED here so the catalog can learn from it:
-- when the same kind of custom job shows up N times, the admin queue surfaces it and the OWNER can promote
-- it to a real Master Task (a price-0, hidden shell the owner then prices). The `price` column below is the
-- tech's per-job quote — NEVER a catalog price.
--
-- Idempotent / additive — safe to re-run. The app degrades gracefully if this hasn't been applied yet.

create table if not exists public.pricebook_custom_entries (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid,                                  -- the job it was quoted on (no FK: degrade-safe)
  tech_id            uuid,                                   -- who entered it
  tech_name          text,
  raw_name            text not null,                         -- what the tech typed
  raw_description     text,                                  -- what they actually did
  cleaned_name        text,                                  -- AI-polished name (suggest-only; tech accepted it)
  cleaned_description text,                                  -- AI-polished, customer-grade description
  materials           text,                                  -- optional "materials used" note
  suggested_category  text,                                  -- AI's category guess for the promote step
  price               numeric(12,2) not null default 0,      -- the tech's ONE-OFF job quote — NOT a catalog price
  status              text not null default 'new'
                        check (status in ('new','promoted','dismissed')),
  promoted_item_id    uuid,                                  -- the catalog shell created on promote (if any)
  created_at          timestamptz not null default now()
);

create index if not exists pbk_custom_status_idx  on public.pricebook_custom_entries (status, created_at desc);
create index if not exists pbk_custom_job_idx      on public.pricebook_custom_entries (job_id);

-- RLS: service-role only (the app reads via the service key + in-code role guards), matching the rest of
-- the pricebook schema. No anon/auth policies = locked by default.
alter table public.pricebook_custom_entries enable row level security;

comment on table public.pricebook_custom_entries is
  'Tech-entered ad-hoc pricebook lines (jobs not in the catalog). price = the tech''s per-job quote, NOT a catalog price. Feeds the admin "promote to Master Task" review queue. AI suggests, owner approves.';

-- 144 — Bounty expiry. An award/bounty can carry an optional end date. When set and in the past, the bounty
-- auto-drops from the tech Start/Races chase list (the query filters it) and the tile shows a live countdown
-- ("5d left" → "Ends today"). NULL = evergreen (no expiry), so existing awards are unaffected. Idempotent.
alter table public.awards
  add column if not exists expires_at timestamptz;

-- Index supporting the "active bounty, filter by expiry" lookup the Start screen runs every sign-in.
-- (No now() in the predicate — that isn't IMMUTABLE; expires_at is in the key so the planner can range-scan it.)
create index if not exists awards_active_expiry_idx
  on public.awards (active, kind, sort, expires_at);

comment on column public.awards.expires_at is 'Optional bounty end time. NULL = evergreen. When past, the bounty auto-drops from the chase list and the tile shows a countdown.';

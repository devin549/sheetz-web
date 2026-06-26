-- Tech-side Reviews: let a tech DISPUTE an unfair low review (Karen / not-CB's-fault). A manager approves
-- or denies; an approved dispute wipes it from the Review Race + restores Crown/Turd eligibility that week.
-- The helper / SMS "ask for a review" is logged too. Additive + idempotent.
alter table public.reviews add column if not exists disputed       boolean not null default false;
alter table public.reviews add column if not exists dispute_reason text;
alter table public.reviews add column if not exists dispute_status text check (dispute_status in ('pending','approved','denied'));
alter table public.reviews add column if not exists disputed_at    timestamptz;
alter table public.reviews add column if not exists dispute_by     text;
alter table public.reviews add column if not exists decided_by     text;
alter table public.reviews add column if not exists decided_at     timestamptz;
create index if not exists reviews_tech_idx on public.reviews (tech_name, created_at desc);
create index if not exists reviews_dispute_idx on public.reviews (dispute_status) where dispute_status = 'pending';

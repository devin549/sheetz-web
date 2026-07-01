-- 165 — let the owner choose which Good/Better/Best tier wears the RECOMMENDED badge, per bundle. The badge was
-- hard-coded to 'better'; on a high-ticket bundle (e.g. water heater) Best is often the smart target. Defaults
-- to 'better' so nothing changes until an owner sets it (buildTiers reads bundle.recommended_tier_key). A future
-- BundleBuilder picker can surface this; the column + engine read land first.
alter table public.pricebook_bundles add column if not exists recommended_tier_key text not null default 'better'
  check (recommended_tier_key in ('good', 'better', 'best'));

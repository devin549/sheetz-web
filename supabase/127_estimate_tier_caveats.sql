-- 127 — Per-tier CAVEAT copy for the customer close ("Close Conversion Levers" — loss-contrast).
-- Lever #2: under the LOWER tiers, the close shows an HONEST red ❌ line of what that option does NOT cover
-- ("A basic snake leaves grease on the walls — it can re-clog in months"). This is loss-framing on REAL
-- value, never fear-mongering: render ONLY when the owner/tech has authored a truthful caveat.
--
-- These are bundle-level Good/Better/Best caveat strings, living alongside the existing good_option_name /
-- good_best_for / warranty_text copy on pricebook_bundles (104_pricebook.sql). The GBB Bundle Builder
-- (feature/pricebook-foundation branch) authors them; this branch adds the FIELD + the close RENDER and
-- threads the value into the estimate tier snapshot. Empty/unauthored → the close renders nothing for that
-- tier (defensive). NO price moves here — presentation copy only; the owner remains the only price-mover.
--
-- Additive + idempotent. Safe to re-run. Old single-tier links keep working (they never read these).
alter table public.pricebook_bundles add column if not exists good_caveat   text;  -- what Good does NOT cover (honest)
alter table public.pricebook_bundles add column if not exists better_caveat text;  -- what Better does NOT cover (honest)
alter table public.pricebook_bundles add column if not exists best_caveat   text;  -- usually blank — Best is the full job

comment on column public.pricebook_bundles.good_caveat   is 'Honest "this option does NOT cover…" line shown under the Good tier on the customer close. Loss-framing on real value, never fear. Blank = nothing rendered.';
comment on column public.pricebook_bundles.better_caveat is 'Honest caveat shown under the Better tier on the customer close. Blank = nothing rendered.';
comment on column public.pricebook_bundles.best_caveat   is 'Honest caveat for the Best tier (usually blank — Best is the complete job). Blank = nothing rendered.';

-- Estimate-level snapshot of the member-savings DISPLAY context + financing partner context (levers #3, #4).
-- Both are JSONB and default null so old links and un-migrated DBs keep working — the close renders nothing
-- for a lever whose context is absent. NEITHER moves a price: member_ctx is the EXISTING plan discount %
-- (a display of what joining would save), financing_ctx is the configured partner's standard terms.
alter table public.pricebook_estimates add column if not exists member_ctx    jsonb;  -- {name,discountPct,monthlyPrice,perks} or null
alter table public.pricebook_estimates add column if not exists financing_ctx jsonb;  -- {partner,slug,months,aprPct,applyUrl} or null

comment on column public.pricebook_estimates.member_ctx    is 'Clog Club member-savings DISPLAY context (existing plan discount %). Never an applied discount — the close shows what joining WOULD save. null = no banner.';
comment on column public.pricebook_estimates.financing_ctx is 'Configured financing partner + standard terms for the "as low as $X/mo" frame. null = honest no-number "ask about financing" prompt. Never moves the quoted price.';

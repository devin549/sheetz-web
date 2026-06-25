-- Estimate / quote jobs — lighter media gate + an outcome, and the estimate→work conversion link.
-- Plus a DispatchMe job id for REFERENCE only (Sheetz/Supabase is the source of truth for photos;
-- we do NOT sync photos back to DispatchMe). Idempotent. Run in the Supabase SQL editor.
alter table public.jobs add column if not exists estimate_outcome     text;   -- sold_now | not_sold | needs_follow_up | needs_parts | customer_not_ready
alter table public.jobs add column if not exists dispatchme_job_id    text;   -- external ref only, no photo sync
alter table public.jobs add column if not exists converted_to_job_id  text;   -- estimate → the work job it became
alter table public.jobs add column if not exists converted_from_job_id text;  -- work job → the estimate it came from

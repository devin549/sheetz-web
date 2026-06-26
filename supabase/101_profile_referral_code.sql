-- Per-tech referral code (Mkt tab). The tech shares this code; new customers book with it → the job lands
-- with jobs.referral_code = this code (already captured at booking, migration 39). Stable + office-ownable;
-- if null the app falls back to a deterministic FIRST-NNN code from the name. Additive, idempotent.
alter table public.profiles add column if not exists referral_code text;

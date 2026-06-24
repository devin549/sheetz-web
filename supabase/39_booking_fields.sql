-- Booking fields — columns the full Job Booking form writes (ported from the live HTML booking).
-- Idempotent, additive. Run in the Supabase SQL editor.
alter table public.jobs add column if not exists notes             text;
alter table public.jobs add column if not exists job_class         text;   -- residential | commercial | warranty | insurance
alter table public.jobs add column if not exists arrival_window    text;
alter table public.jobs add column if not exists po_number         text;
alter table public.jobs add column if not exists claim_number      text;
alter table public.jobs add column if not exists warranty_provider text;
alter table public.jobs add column if not exists how_heard         text;
alter table public.jobs add column if not exists referral_code     text;
alter table public.jobs add column if not exists state             text;
alter table public.jobs add column if not exists zip               text;

-- Consent captured at booking (we never auto-send — this records permission + when/where).
alter table public.customers add column if not exists marketing_consent boolean;
-- (customers.email, sms_consent, consent_source, consent_ts already exist.)

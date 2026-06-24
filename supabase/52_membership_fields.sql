-- Memberships → real recurring revenue: billing status, benefits, discount, next service due.
-- Idempotent, additive. Run in the Supabase SQL editor.
alter table public.memberships add column if not exists billing_status   text default 'current';  -- current | past_due | comp
alter table public.memberships add column if not exists benefits         text;
alter table public.memberships add column if not exists discount_pct     numeric;
alter table public.memberships add column if not exists next_service_due date;

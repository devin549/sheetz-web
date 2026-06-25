-- Command Center PIN hardening (ported from CB_Tech_PinSecurity_v1.js): 3 failed attempts → 15-minute
-- lockout, and on the 3rd fail the device snaps an intruder photo for the owner/GM. Per-user attempt +
-- lockout counters live on profiles; the photos go to a PRIVATE storage bucket (service-role access only).
-- Idempotent. Run in the Supabase SQL editor.
alter table public.profiles add column if not exists cc_pin_attempts   int not null default 0;
alter table public.profiles add column if not exists cc_pin_lock_until timestamptz;

-- Private bucket for intruder snapshots. Not public — only the service role (server) reads/writes it.
insert into storage.buckets (id, name, public)
values ('intruder-photos', 'intruder-photos', false)
on conflict (id) do nothing;

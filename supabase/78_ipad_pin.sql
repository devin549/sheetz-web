-- "PIN for this iPad" — the quick sign-in / app-lock PIN every tech sets (after their first password
-- login). Same hardening as the Command Center PIN: salted hash, 3 wrong attempts → 15-min lockout, and
-- the 3rd fail snaps an intruder photo (reuses the intruder-photos bucket from migration 77). This is the
-- general app lock; the Command Center PIN (mig 76/77) stays as the owner/supervisor layer on top.
-- Idempotent. Run in the Supabase SQL editor.
alter table public.profiles add column if not exists ipad_pin_hash     text;
alter table public.profiles add column if not exists ipad_pin_set_at   timestamptz;
alter table public.profiles add column if not exists ipad_pin_attempts int not null default 0;
alter table public.profiles add column if not exists ipad_pin_lock_until timestamptz;

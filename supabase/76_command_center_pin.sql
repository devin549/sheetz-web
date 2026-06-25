-- Command Center second-factor PIN. Owner + supervisors must enter a personal PIN to open the Command
-- Center (AR / money / crew board), on top of their login — so a glance at, or an unlocked, iPad doesn't
-- expose the sensitive dashboard. Per-user (each sets their own), stored as a salted SHA-256 hash; the
-- raw PIN is never stored. Idempotent. Run in the Supabase SQL editor.
alter table public.profiles add column if not exists cc_pin_hash   text;
alter table public.profiles add column if not exists cc_pin_set_at timestamptz;

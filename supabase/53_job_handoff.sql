-- Dispatch handoff context — the "what the tech needs to know" fields captured at booking and shown
-- on the board/job panel. Idempotent, additive. Run in the Supabase SQL editor.
alter table public.jobs add column if not exists customer_promise text;   -- what we promised the customer
alter table public.jobs add column if not exists access_notes     text;   -- gate code, dog, parking, lockbox
alter table public.jobs add column if not exists sold_scope       text;   -- what was sold / scope of work
alter table public.jobs add column if not exists must_tell_tech   text;   -- 🚨 critical heads-up for the tech
alter table public.jobs add column if not exists csr              text;   -- who booked it

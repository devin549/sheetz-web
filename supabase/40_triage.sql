-- Triage — structured intake answers (water-heater fuel/size, leak/shutoff, decoded unit, etc.)
-- captured at booking, stored on the job. Idempotent, additive. Run in the Supabase SQL editor.
alter table public.jobs add column if not exists triage jsonb;

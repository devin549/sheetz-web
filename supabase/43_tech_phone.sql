-- Tech phone — so the office can text the assigned tech (e.g. the dispatch.me "On My Way" link on
-- warranty jobs). Set on /team. Idempotent, additive. Run in the Supabase SQL editor.
alter table public.techs add column if not exists phone text;

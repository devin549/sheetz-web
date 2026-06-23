-- Crew grouping for the dispatch board's time grid (live board groups techs by crew:
-- "Drain Team", "HVAC Squad", etc.). Until set, every tech falls under "Team". Idempotent.
-- Run in the Supabase SQL editor, then set each tech's crew, e.g.:
--   update public.techs set crew = 'Drain Team' where name in ('Matt Shepard','dylan hasson');
--   update public.techs set crew = 'HVAC Squad'  where name = 'Jacob Lovin';

alter table public.techs add column if not exists crew text;

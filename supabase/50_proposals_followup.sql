-- Backfill proposals follow-up columns. 22_proposals.sql created the table first, so 30_proposals.sql's
-- `create table if not exists` was a no-op and these never got added on existing DBs. Idempotent.
alter table public.proposals add column if not exists contacted_at  timestamptz;
alter table public.proposals add column if not exists contact_count int not null default 0;
alter table public.proposals add column if not exists outcome       text;
alter table public.proposals add column if not exists outcome_at    timestamptz;
alter table public.proposals add column if not exists outcome_by    text;

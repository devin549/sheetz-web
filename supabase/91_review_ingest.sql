-- Google reviews watcher — dedupe + auto-match fields. The cron pulls reviews from the Google Place and
-- inserts new ones; external_id stops double-inserts; matched/match_method record the auto-assignment.
-- Additive + idempotent.
alter table public.reviews add column if not exists external_id  text;
alter table public.reviews add column if not exists matched      boolean not null default false;
alter table public.reviews add column if not exists match_method text;   -- named | job | manual
create unique index if not exists reviews_external_id_idx on public.reviews (external_id) where external_id is not null;

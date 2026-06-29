-- 🚩 Proof-photo AI override logging — when a tech pushes past the on-capture AI clarity check
-- ("Use it anyway"), tag the photo so a supervisor reviews it in the QA flow. Append-only, safe to re-run.
alter table public.job_photos
  add column if not exists ai_flagged     boolean not null default false,
  add column if not exists ai_flag_reason text;

create index if not exists job_photos_ai_flagged_idx on public.job_photos (ai_flagged) where ai_flagged;

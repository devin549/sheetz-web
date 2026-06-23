-- Supervisor QA + closeout spine. Supervisor verifies the work; the close-gate blocks a job
-- from going 'done' until the media rule is met and nothing is failed (or a supervisor overrides
-- with a logged reason).
--
-- REQUIRES supabase/23_job_photo_spine.sql first (job_photos). Idempotent. Run in SQL Editor.

create extension if not exists pgcrypto;

-- Per-job-type closeout rule (configurable). job_type '*' is the default applied when a job's
-- type has no specific rule. Photos-first: require_video defaults false until video upload ships.
create table if not exists public.job_media_rules (
  job_type       text primary key default '*',
  min_photos     int  not null default 3,
  required_kinds text[] not null default '{before,after}',
  require_video  boolean not null default false,
  updated_at     timestamptz not null default now()
);
insert into public.job_media_rules (job_type, min_photos, required_kinds, require_video)
values ('*', 3, '{before,after}', false)
on conflict (job_type) do nothing;

-- Supervisor pass/fail decision on a single photo/video. Latest row per photo wins.
create table if not exists public.job_photo_reviews (
  id              uuid primary key default gen_random_uuid(),
  photo_id        uuid not null references public.job_photos(id) on delete cascade,
  job_id          text not null,                 -- denormalized (jobs.id), no FK to dodge id-type coupling
  result          text not null check (result in ('pass','fail')),
  fail_reason     text check (fail_reason in (
                    'blurry','wrong_area','no_after_proof','unfinished','missing_equipment','customer_issue','other')),
  manager_note    text,
  reviewed_by     uuid,
  reviewed_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists job_photo_reviews_photo_idx on public.job_photo_reviews (photo_id, created_at desc);
create index if not exists job_photo_reviews_job_idx   on public.job_photo_reviews (job_id, created_at desc);

-- Circle/box markers showing WHERE the problem is on a failed photo (coords normalized 0..1).
create table if not exists public.job_photo_annotations (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.job_photo_reviews(id) on delete cascade,
  photo_id   uuid not null references public.job_photos(id) on delete cascade,
  shape      text not null default 'circle' check (shape in ('circle','box')),
  x          numeric not null,
  y          numeric not null,
  w          numeric,
  h          numeric,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists job_photo_annotations_review_idx on public.job_photo_annotations (review_id);

-- General audit trail: who did what, when, from which role (closeout overrides, QA decisions, etc.).
create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid,
  actor_name text,
  role       text,
  action     text not null,        -- e.g. 'closeout.override', 'qa.fail', 'qa.pass'
  entity     text,                 -- e.g. 'job', 'photo'
  entity_id  text,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id, created_at desc);
create index if not exists audit_log_action_idx on public.audit_log (action, created_at desc);

-- RLS on, NO policies by design: only the server's service-role client reads/writes these.
alter table public.job_media_rules        enable row level security;
alter table public.job_photo_reviews       enable row level security;
alter table public.job_photo_annotations   enable row level security;
alter table public.audit_log               enable row level security;

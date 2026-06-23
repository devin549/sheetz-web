-- ============================================================================
-- ROLES + QA + ETA — run-all bundle. Paste this ONE file into Supabase SQL Editor.
-- Contains migrations 23 → 26 in dependency order. Idempotent (safe to re-run).
-- ============================================================================

-- ========================= 23_job_photo_spine.sql =========================
-- CB Cam spine: private job photos attached to jobs.
-- Run in Supabase SQL Editor. Idempotent and safe to re-run.
--
-- Files live in the private Supabase Storage bucket `job-photos`.
-- Metadata lives here so job detail, closeout, warranty proof, lawyer packets,
-- and customer-visible packets all share one source of truth.

create extension if not exists pgcrypto;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'job-photos',
  'job-photos',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  job_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into job_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'jobs'
    and a.attname = 'id'
    and not a.attisdropped;

  if job_id_type is null then
    raise exception 'public.jobs.id was not found';
  end if;

  execute format($create$
    create table if not exists public.job_photos (
      id uuid primary key default gen_random_uuid(),
      job_id %s not null references public.jobs(id) on delete cascade,
      storage_bucket text not null default 'job-photos',
      storage_path text not null unique,
      file_name text not null,
      mime_type text not null,
      size_bytes bigint not null default 0,
      kind text not null default 'job_photo',
      caption text,
      tags text[] not null default '{}',
      customer_visible boolean not null default false,
      uploaded_by uuid,
      uploaded_by_email text,
      uploaded_by_name text,
      deleted_at timestamptz,
      deleted_by uuid,
      created_at timestamptz not null default now(),
      constraint job_photos_kind_chk check (
        kind in (
          'job_photo',
          'before',
          'during',
          'after',
          'receipt',
          'damage',
          'equipment',
          'closeout'
        )
      )
    )
  $create$, job_id_type);
end $$;

create index if not exists job_photos_job_created_idx
  on public.job_photos (job_id, created_at desc)
  where deleted_at is null;

create index if not exists job_photos_customer_visible_idx
  on public.job_photos (job_id, customer_visible, created_at desc)
  where deleted_at is null and customer_visible = true;

create index if not exists job_photos_uploaded_by_idx
  on public.job_photos (uploaded_by, created_at desc)
  where deleted_at is null;

-- RLS on, NO policies by design: only the server's service-role client reads/writes these
-- rows (and serves images via signed URLs), so anon/authenticated are denied by default.
-- Do NOT add permissive policies — that would expose private job photos to the browser client.
alter table public.job_photos enable row level security;

comment on table public.job_photos is
'Private metadata for CB Cam job photos. Storage objects live in the private job-photos bucket.';

comment on column public.job_photos.customer_visible is
'True only when this photo may appear in a customer-facing packet or portal.';

-- ========================= 24_profiles.sql =========================
-- Employee profiles: one row per Supabase Auth login. The app reads role + scope from HERE
-- (server-side, service-role) before showing pages or allowing actions. This is the keystone
-- of the access model: one login → one role → one scope.
--
-- Safe to run before backfilling rows: the app falls back to auth user_metadata when a login
-- has no profile yet, so existing logins keep working. Idempotent.
-- Run in Supabase → SQL Editor.

create extension if not exists pgcrypto;

-- tech_id type is matched to techs.id (uuid on Supabase, but detected so the FK never fails).
do $$
declare tid_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into tid_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'techs' and a.attname = 'id' and not a.attisdropped;
  if tid_type is null then tid_type := 'uuid'; end if;

  execute format($ct$
    create table if not exists public.profiles (
      user_id    uuid primary key references auth.users(id) on delete cascade,
      name       text,
      email      text,
      role       text not null default 'viewer',
      tech_id    %s references public.techs(id) on delete set null,  -- techs link → tech sees only their jobs
      crew_id    text,            -- text for now (techs.crew is text); normalize to a crews table later
      active     boolean not null default true,   -- disable former employees without deleting history
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint profiles_role_chk check (role in (
        'owner','admin','dispatcher','csr','foreman','tech','viewer','customer',
        'gm','om','accounting','fs','sales','marketing','shop','helper'
      ))
    )
  $ct$, tid_type);
end $$;

create index if not exists profiles_tech_id_idx on public.profiles (tech_id) where tech_id is not null;
create index if not exists profiles_role_idx    on public.profiles (role);

-- RLS on, NO policies by design: only the server's service-role client reads/writes profiles.
-- Role + scope must never be editable from the browser, so anon/authenticated stay denied.
alter table public.profiles enable row level security;

comment on table public.profiles is
'Per-login employee profile: role + tech_id/crew_id scope + active flag. Server-authoritative; service-role only.';

-- Seed the owner so there is always one full-access login. Other staff are backfilled from /team.
insert into public.profiles (user_id, name, email, role)
select u.id, coalesce(u.raw_user_meta_data->>'name', u.email), u.email, 'owner'
from auth.users u
where lower(u.email) = 'devin@clogbusterzplumbing.com'
on conflict (user_id) do update set role = 'owner', email = excluded.email, updated_at = now();

-- ========================= 25_qa_spine.sql =========================
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

-- ========================= 26_eta_updates.sql =========================
-- Running-Late ETA relay. The TECH reports a delay (structured event, no path to the customer);
-- the OFFICE sees it on the board and controls the customer message (call / text / acknowledge).
-- This honors the no-auto-send-to-customers rule: nothing reaches a customer without a human.
-- Idempotent. Run in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.job_eta_updates (
  id                uuid primary key default gen_random_uuid(),
  job_id            text not null,                 -- jobs.id (denormalized; no FK to dodge id-type coupling)
  minutes           int not null default 0,        -- how much later (e.g. 30)
  note              text,                          -- tech's note ("cable stuck, need 30 more min")
  needs_help        boolean not null default false,-- "Need office help" → ping dispatch, not the customer
  new_eta           timestamptz,                   -- client-computed new arrival (browser/Eastern)
  created_by        uuid,
  created_by_name   text,
  created_at        timestamptz not null default now(),
  ack_by            uuid,
  ack_by_name       text,
  ack_at            timestamptz,                   -- office acknowledged the report
  customer_notified boolean not null default false -- office sent the customer notice (call/text)
);
create index if not exists job_eta_updates_job_idx on public.job_eta_updates (job_id, created_at desc);
create index if not exists job_eta_updates_open_idx on public.job_eta_updates (created_at desc) where ack_at is null;

-- RLS on, NO policies by design: server (service-role) only.
alter table public.job_eta_updates enable row level security;

comment on table public.job_eta_updates is
'Tech-reported delays. The office controls any customer-facing message — nothing here auto-texts a customer.';

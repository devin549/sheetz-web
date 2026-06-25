-- Closeout questions — the second half of the completion gate (after media/QA + rentals).
-- A per-job-type checklist the tech must answer before a job can close (e.g. water-heater install →
-- "Pulled permit?", "Tested for leaks?", "Photo of data plate attached?"). Config-driven, NOT hardcoded:
-- policy lives in this table, so the office tunes it without a code change. Idempotent. Run in Supabase.
create extension if not exists pgcrypto;

-- Config: one row per job_type. `questions` is an ordered JSONB array of:
--   { "key": "leaks", "prompt": "Tested for leaks?", "type": "yesno"|"text"|"number",
--     "required": true, "must_be": "yes" }      -- must_be (optional) forces a specific answer to pass
-- job_type '*' is the fallback. Seeded EMPTY so the gate stays open until the office adds questions
-- (soft launch: configure per-type, then it blocks). An exact job_type overrides '*'.
create table if not exists public.job_closeout_questions (
  job_type   text primary key default '*',
  questions  jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.job_closeout_questions (job_type, questions)
values ('*', '[]'::jsonb)
on conflict (job_type) do nothing;

-- Example config (uncomment + edit to turn the gate on for a job type):
-- insert into public.job_closeout_questions (job_type, questions) values
--   ('Water Heater Install', '[
--     {"key":"permit","prompt":"Permit pulled / on file?","type":"yesno","required":true,"must_be":"yes"},
--     {"key":"leaks","prompt":"Tested for leaks after install?","type":"yesno","required":true,"must_be":"yes"},
--     {"key":"dataplate","prompt":"Data-plate photo attached?","type":"yesno","required":true,"must_be":"yes"},
--     {"key":"model","prompt":"Model # installed","type":"text","required":true}
--   ]'::jsonb)
-- on conflict (job_type) do update set questions = excluded.questions, updated_at = now();

-- Answers: one row per job (the tech's responses). answers is { "<key>": <value> }.
create table if not exists public.job_closeout_answers (
  job_id     text primary key,
  answers    jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.job_closeout_questions enable row level security;
alter table public.job_closeout_answers   enable row level security;

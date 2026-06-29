-- 140 — Completion ("final") signature. When the work is done, the customer signs the completion-acceptance
-- language (drafted by counsel) — "full and final acceptance of the work performed." Stored on the job's
-- closeout row alongside the disposition checklist.
alter table public.job_closeout
  add column if not exists completion_signature   text,
  add column if not exists completion_signed_name text,
  add column if not exists completion_signed_at    timestamptz;

comment on column public.job_closeout.completion_signature is 'Base64 PNG of the customer''s FINAL acceptance signature at job completion (the Completion Acceptance terms).';

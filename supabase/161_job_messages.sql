-- 161 — Job message thread. A two-way, PERSISTENT office↔tech conversation scoped to one job, so nothing a
-- tech says (or the office replies) gets lost in Discord. The step-away pings (parts run / lunch / personal /
-- need-a-hand) write here too, so the whole "what happened on this job" timeline lives in one place.
create extension if not exists pgcrypto;

create table if not exists public.job_messages (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null,
  author_id    uuid,
  author_name  text,
  author_role  text,
  kind         text not null default 'message',  -- message | office_reply | parts_run | lunch | personal | help | back | system
  body         text,
  created_at   timestamptz not null default now()
);
create index if not exists job_messages_job_idx on public.job_messages (job_id, created_at);
alter table public.job_messages enable row level security;

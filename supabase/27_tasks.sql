-- Office/field task list (Reports & Tasks → Tasks). Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  detail     text,
  assignee   text,                 -- free text name/email for now
  due_date   date,
  priority   text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status     text not null default 'open' check (status in ('open', 'done')),
  created_by text,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index if not exists tasks_open_idx on public.tasks (status, due_date, created_at desc);

-- RLS on, service-role only (the server gates by role).
alter table public.tasks enable row level security;

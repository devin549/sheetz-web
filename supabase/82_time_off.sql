-- Time-off requests (audit #6): a tech requests vacation/sick/personal/unpaid → routes to a Field
-- Supervisor/GM for approval (never auto-approved, per CB policy). Idempotent. Run in the SQL editor.
create table if not exists public.time_off_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  tech_name      text,
  kind           text not null default 'vacation' check (kind in ('vacation','sick','personal','unpaid')),
  start_date     date not null,
  end_date       date,
  reason         text,
  status         text not null default 'pending' check (status in ('pending','approved','denied')),
  decided_by     uuid,
  decided_by_name text,
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now()
);
create index if not exists time_off_user_idx on public.time_off_requests (user_id, created_at desc);
create index if not exists time_off_status_idx on public.time_off_requests (status, start_date);

alter table public.time_off_requests enable row level security;  -- server (service-role) access only

-- Office goals/targets — the numbers the board's Office Targets gauges + Game Plan missions measure
-- against. Editable on /settings. Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.office_goals (
  key        text primary key,
  label      text not null,
  target     numeric not null default 0,
  unit       text not null default 'count',   -- 'dollars' | 'count'
  assignee   text,
  sort       int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.office_goals (key, label, target, unit, assignee, sort) values
  ('booked_day',     'Booked today',      18000, 'dollars', 'Owner',      1),
  ('avg_ticket',     'Avg ticket',          750, 'dollars', 'Sales',      2),
  ('qa_clear',       'Clear QA holds',        0, 'count',   'Supervisor', 3),
  ('ar_collect_week','Collect AR (week)',  25000, 'dollars', 'Accounting', 4),
  ('calls_day',      'Calls booked',         25, 'count',   'CSRs',       5),
  ('reviews_week',   'New reviews (week)',   10, 'count',   'CSRs',       6),
  ('same_day_fills', 'Same-day fills',        5, 'count',   'Dispatch',   7)
on conflict (key) do nothing;

-- RLS on, service-role only.
alter table public.office_goals enable row level security;

-- Shop Counter — parts/materials issued to a JOB# (cost hits the job, NOT tech pay), plus returns
-- and rentals. Ported from the live HTML shop sheet. Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.shop_issues (
  id                uuid primary key default gen_random_uuid(),
  job_id            text,                              -- the JOB# the cost lands on
  customer          text,
  item_name         text not null,
  sku               text,
  qty               numeric not null default 1,
  unit              text default 'ea',
  unit_cost_cents   bigint not null default 0,
  total_cost_cents  bigint not null default 0,         -- qty × unit_cost (computed in the app)
  kind              text not null default 'issue',     -- issue | rental
  rental_daily_cents bigint,                           -- rentals: daily rate
  rental_days       int,
  status            text not null default 'out',       -- out | returned
  issued_to         text,                              -- tech who took it (optional)
  note              text,
  issued_by         text,
  created_at        timestamptz not null default now(),
  returned_at       timestamptz,
  returned_by       text
);
create index if not exists shop_issues_job_idx on public.shop_issues (job_id);
create index if not exists shop_issues_created_idx on public.shop_issues (created_at desc);
create index if not exists shop_issues_status_idx on public.shop_issues (status);

alter table public.shop_issues enable row level security;

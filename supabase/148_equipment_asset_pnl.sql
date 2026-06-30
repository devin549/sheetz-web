-- 148 — Equipment as a real ASSET with a P&L. Reid fills each machine's profile + financing; we log service
-- costs; and checking a machine OUT to a job links it so the job's revenue rolls up. Per-machine money truth:
-- earned (linked jobs) − costs (purchase + service) = net, plus financing (paid off / balance). Idempotent.

-- Profile + financing on the unit.
alter table public.equipment_fleet
  add column if not exists description       text,
  add column if not exists make              text,          -- e.g. "John Deere"
  add column if not exists year              int,
  add column if not exists serial            text,
  add column if not exists photo_url         text,
  add column if not exists engine_hours      numeric,
  add column if not exists purchase_cents    bigint,        -- what we paid / its cost basis
  add column if not exists purchase_date     date,
  add column if not exists financed          boolean not null default false,
  add column if not exists lender            text,
  add column if not exists monthly_cents     bigint,        -- monthly payment
  add column if not exists payoff_cents      bigint,        -- balance still owed
  add column if not exists paid_off          boolean not null default false;

-- Service / maintenance log (each event + cost).
create table if not exists public.equipment_service (
  id           uuid primary key default gen_random_uuid(),
  unit_id      uuid references public.equipment_fleet(id) on delete cascade,
  service_date date not null default current_date,
  item         text not null,
  vendor       text,
  cost_cents   bigint,
  hours        numeric,                 -- engine hours at service (optional)
  note         text,
  by_name      text,
  created_at   timestamptz not null default now()
);
create index if not exists equipment_service_unit_idx on public.equipment_service (unit_id, service_date desc);

-- Machine ↔ job link (revenue rollup). One row per (unit, job) so a job's value counts once even if scanned
-- out to it several times. Populated when a machine is checked out to the scanning tech's active job.
create table if not exists public.equipment_job_use (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid references public.equipment_fleet(id) on delete cascade,
  job_id      uuid,
  job_number  text,
  used_by     text,
  used_at     timestamptz not null default now(),
  unique (unit_id, job_id)
);
create index if not exists equipment_job_use_unit_idx on public.equipment_job_use (unit_id);

comment on table public.equipment_service is 'Per-machine service/maintenance log + cost (feeds the equipment P&L).';
comment on table public.equipment_job_use is 'Machine↔job links from scan-out — the jobs each machine worked, for the revenue rollup.';

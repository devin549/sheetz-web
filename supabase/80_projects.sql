-- Projects / multi-unit work (Maxwell → Beatyville Manor → Apt 101/102… → visits). A PROJECT is one big
-- job at one site for one payer; UNITS are the apartments/areas; VISITS are the individual jobs (rough-in,
-- finish, repair, inspection) — each existing `jobs` row links to a project + unit. The contractor/payer's
-- billing address can differ from the job site. Margin rolls up from the linked jobs. Idempotent.
create table if not exists public.projects (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid,                       -- the PAYER (e.g. Maxwell Construction)
  name              text not null,              -- e.g. "Beatyville Manor"
  site_address      text,                       -- the job SITE (may differ from payer billing address)
  billing_address   text,
  status            text not null default 'active' check (status in ('active','on_hold','done','cancelled')),
  hold_reason       text,                       -- rain / waiting on parts / waiting on customer
  tech_id           uuid,                       -- stays assigned to this tech until done or a manager moves it
  target_completion date,
  created_by        uuid,
  created_at        timestamptz not null default now()
);
create index if not exists projects_customer_idx on public.projects (customer_id);

create table if not exists public.project_units (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  label       text not null,                    -- "Apt 101"
  status      text not null default 'open' check (status in ('open','in_progress','done')),
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists project_units_project_idx on public.project_units (project_id, sort);

-- Each job (a VISIT) can belong to a project + a unit.
alter table public.jobs add column if not exists project_id      uuid;
alter table public.jobs add column if not exists project_unit_id uuid;
create index if not exists jobs_project_idx on public.jobs (project_id);

alter table public.projects     enable row level security;  -- server (service-role) access only
alter table public.project_units enable row level security;

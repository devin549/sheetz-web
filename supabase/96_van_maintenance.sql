-- My Truck · Maintenance (HTML van pane): oil tracking, van stats, documents, service log + AI keep/replace.
-- Keyed by the van's tech (one van per tech in CB). Additive, idempotent, RLS-locked.
create extension if not exists pgcrypto;

create table if not exists public.van_maintenance (
  id                 uuid primary key default gen_random_uuid(),
  tech_name          text,                 -- the van's primary tech (matches My Truck's per-tech view)
  van_id             text,
  van_label          text,                 -- "Van #14 · Ford Transit 250 · 2021"
  current_mileage    int,
  last_oil_mileage   int,
  oil_interval       int not null default 5000,
  last_service_date  date,
  last_tire_rotation date,
  dot_through        date,
  insurance_through  date,
  registration_through date,
  insurance_pdf      text,
  registration_pdf   text,
  dot_pdf            text,
  updated_at         timestamptz not null default now()
);
create unique index if not exists van_maintenance_tech_idx on public.van_maintenance (tech_name);
alter table public.van_maintenance enable row level security;

create table if not exists public.van_service_log (
  id           uuid primary key default gen_random_uuid(),
  tech_name    text,
  van_id       text,
  service_date date not null default current_date,
  item         text not null,
  cost_cents   bigint not null default 0,
  vendor       text,
  mileage      int,
  created_at   timestamptz not null default now()
);
create index if not exists van_service_log_tech_idx on public.van_service_log (tech_name, service_date desc);
alter table public.van_service_log enable row level security;

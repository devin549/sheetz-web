-- Inventory location resolver + routing/reservation (Tools & Parts map). Ties tools/parts to physical
-- locations (tech van GPS / shop / vendor) and lets a tech reserve + route + request a transfer, tied to
-- the current job. Additive, idempotent, RLS-locked. Builds on tech_locations(60), vendors(47), tools(05).

-- 1) Tech GPS — add the live-status fields the resolver needs (battery / status / current job).
alter table public.tech_locations add column if not exists battery       int;
alter table public.tech_locations add column if not exists status        text;          -- on_shift | on_site | driving | off
alter table public.tech_locations add column if not exists current_job_id uuid;

-- 2) Shops — fixed locations (lib/shops.js seeds labels; this holds the coordinates).
create table if not exists public.shops (
  id         text primary key,             -- 'richmond' | 'lexington' | …
  name       text not null,
  address    text,
  lat        double precision,
  lng        double precision,
  phone      text,
  updated_at timestamptz not null default now()
);
alter table public.shops enable row level security;

-- 3) Vendors — add the map + hours fields (47 had name/phone/account but no location).
alter table public.vendors add column if not exists address text;
alter table public.vendors add column if not exists lat     double precision;
alter table public.vendors add column if not exists lng     double precision;
alter table public.vendors add column if not exists hours   text;

-- 4) Serialized tools — where a tool currently lives (resolver maps holder → coordinates).
alter table public.tools add column if not exists current_holder_type text;   -- tech | shop | vendor | job | unknown
alter table public.tools add column if not exists current_holder_id   text;   -- tech_id | shop_id | vendor_id | job_id
alter table public.tools add column if not exists current_holder_name text;
alter table public.tools add column if not exists battery             int;     -- % for powered tools

-- 5) Parts inventory counted PER LOCATION (item × location). truck_inventory stays the per-van view;
--    this is the multi-location count the resolver ranks across (shop bins, vendor stock, other vans).
create table if not exists public.item_locations (
  id            uuid primary key default gen_random_uuid(),
  sku           text,
  name          text not null,
  location_type text not null check (location_type in ('tech','shop','vendor','job','unknown')),
  location_id   text,
  qty           numeric not null default 0,
  min_qty       numeric,
  bin           text,
  updated_at    timestamptz not null default now()
);
create index if not exists item_locations_name_idx on public.item_locations (name);
create index if not exists item_locations_loc_idx  on public.item_locations (location_type, location_id);
alter table public.item_locations enable row level security;

-- 6) Reservations / transfer requests — Reserve / Go-Get-It ties an item to the current job + notifies.
create table if not exists public.inventory_reservations (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid,
  item_kind        text not null check (item_kind in ('tool','part')),
  item_id          text,
  item_name        text,
  qty              numeric default 1,
  requested_by     uuid,
  requested_by_name text,
  holder_type      text,                    -- tech | shop | vendor | job | unknown
  holder_id        text,
  holder_name      text,
  status           text not null default 'reserved'
                   check (status in ('reserved','pickup_pending','accepted','problem','fulfilled','cancelled')),
  eta_min          int,
  note             text,
  created_at       timestamptz not null default now()
);
create index if not exists inventory_reservations_job_idx    on public.inventory_reservations (job_id);
create index if not exists inventory_reservations_status_idx on public.inventory_reservations (status, created_at desc);
alter table public.inventory_reservations enable row level security;

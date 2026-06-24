-- Vendors, vendor price book, and purchase orders for the Shop module. Idempotent. Run in SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.vendors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  account_no text,
  rep        text,
  phone      text,
  email      text,
  terms      text,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists vendors_name_idx on public.vendors (name);

-- What we pay a vendor for a part (the price book the Bulk-Buy Finder compares against).
create table if not exists public.vendor_prices (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid,
  vendor_name text,
  item        text not null,
  sku         text,
  price_cents bigint not null default 0,
  unit        text default 'ea',
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists vendor_prices_vendor_idx on public.vendor_prices (vendor_id);
create index if not exists vendor_prices_item_idx on public.vendor_prices (item);

create table if not exists public.purchase_orders (
  id          uuid primary key default gen_random_uuid(),
  po_number   text,
  vendor_id   uuid,
  vendor_name text,
  status      text not null default 'draft',   -- draft | ordered | received
  total_cents bigint not null default 0,
  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  ordered_at  timestamptz,
  received_at timestamptz
);
create index if not exists purchase_orders_status_idx on public.purchase_orders (status, created_at desc);

create table if not exists public.po_lines (
  id              uuid primary key default gen_random_uuid(),
  po_id           uuid not null references public.purchase_orders(id) on delete cascade,
  item            text not null,
  sku             text,
  qty             numeric not null default 1,
  unit_cost_cents bigint not null default 0,
  line_total_cents bigint not null default 0
);
create index if not exists po_lines_po_idx on public.po_lines (po_id);

alter table public.vendors enable row level security;
alter table public.vendor_prices enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.po_lines enable row level security;

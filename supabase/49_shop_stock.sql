-- Shop (warehouse) stock with bin locations — powers Slotting & Putaway (assign bins) + Stock Map
-- (see what's in each bin). Distinct from per-van truck_inventory. Idempotent. Run in SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.shop_stock (
  id         uuid primary key default gen_random_uuid(),
  item       text not null,
  sku        text,
  qty        numeric not null default 0,
  bin        text,                       -- shop location (e.g. A-3, RACK 2)
  min_qty    numeric,
  note       text,
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists shop_stock_bin_idx on public.shop_stock (bin);
create index if not exists shop_stock_item_idx on public.shop_stock (item);

alter table public.shop_stock enable row level security;

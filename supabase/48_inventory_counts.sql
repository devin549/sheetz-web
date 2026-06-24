-- Parts Reconciliation — physical counts vs system qty, so shrink/variance shows up. Idempotent.
create extension if not exists pgcrypto;

create table if not exists public.inventory_counts (
  id          uuid primary key default gen_random_uuid(),
  item        text not null,
  sku         text,
  location    text,                    -- van/tech or shop bin
  system_qty  numeric not null default 0,
  counted_qty numeric not null default 0,
  variance    numeric not null default 0,   -- counted - system (negative = shrink)
  note        text,
  counted_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists inventory_counts_created_idx on public.inventory_counts (created_at desc);

alter table public.inventory_counts enable row level security;

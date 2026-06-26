-- 120 — Barcodes for pricebook items. ONE item has MANY barcodes: the same physical part is sold under
-- different manufacturer UPCs across vendors (Everbilt @ Home Depot, Oatey @ Lowe's, …) — all one part.
-- A field scan of any of them resolves to the same item → its price + which services use it.
create table if not exists public.pricebook_barcodes (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.pricebook_items(id) on delete cascade,
  barcode       text not null,                 -- UPC / EAN / vendor SKU as scanned
  vendor_seller text,                           -- where this barcode is from (Home Depot, Lowe's, …)
  label         text,                           -- optional note ("Everbilt standard")
  times_scanned integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (barcode)                              -- a scanned code resolves to exactly one item
);
create index if not exists pbk_barcodes_item_idx on public.pricebook_barcodes (item_id);
alter table public.pricebook_barcodes enable row level security;

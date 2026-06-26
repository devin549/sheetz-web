-- 119 — Learning bill-of-materials + SerpAPI vendor pricing. Instead of ServiceTitan part numbers we
-- LEARN which parts go with which service (from what techs actually use on jobs), the owner CLASSIFIES
-- the suggestions (confirm / edit / reject), and SerpAPI prices each part live (Home Depot / Lowe's /
-- Google Shopping). Confirmed parts → a real BOM whose live cost feeds margin-watch.
create table if not exists public.pricebook_learned_links (
  id              uuid primary key default gen_random_uuid(),
  service_item_id uuid not null references public.pricebook_items(id) on delete cascade,
  part_name       text not null,                       -- the part, by name (parts aren't always items)
  part_item_id    uuid references public.pricebook_items(id) on delete set null, -- if matched to a catalog item
  quantity        numeric(12,2) not null default 1,
  times_seen      integer not null default 1,          -- co-occurrence count (the "learning" signal)
  status          text not null default 'suggested' check (status in ('suggested','confirmed','rejected')),
  -- cached SerpAPI vendor price (refreshed on demand)
  vendor_seller   text,
  vendor_price    numeric(12,2),
  vendor_url      text,
  vendor_checked_at timestamptz,
  classified_by   uuid,
  classified_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (service_item_id, part_name)
);
create index if not exists pbk_learned_service_idx on public.pricebook_learned_links (service_item_id, status);
alter table public.pricebook_learned_links enable row level security;

-- Part aliases — so the shop (Reid) can give a part the names the guys actually call it, and Hook's
-- locator + chat find it by any of them (just like tool aliases). Keyed loosely by sku OR name. Additive.
create extension if not exists pgcrypto;
create table if not exists public.part_aliases (
  id         uuid primary key default gen_random_uuid(),
  sku        text,
  name       text,
  alias      text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists part_aliases_alias_idx on public.part_aliases (alias);
create index if not exists part_aliases_sku_idx   on public.part_aliases (sku);
alter table public.part_aliases enable row level security;

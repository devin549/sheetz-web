-- 147 — Scan-out + locate for tagged equipment. Each unit (mig 146) carries a ShareMyToolbox QR tag; a tech
-- scans it to CHECK OUT (custody), CHECK IN, or LOCATE (drop a pin). The unit row holds the current snapshot;
-- equipment_scans is the history/audit trail. Locations come from the scanning device's GPS (best-effort) and/
-- or a typed site. Idempotent.
create extension if not exists pgcrypto;

-- Current snapshot on the unit (who has it + where, right now).
alter table public.equipment_fleet
  add column if not exists status      text default 'in',   -- 'in' (yard/shop) | 'out' (checked out)
  add column if not exists held_by     text,                -- who has it now (null = nobody)
  add column if not exists held_at     timestamptz,
  add column if not exists location    text,                -- last known place (site or address)
  add column if not exists lat         double precision,
  add column if not exists lng         double precision,
  add column if not exists scanned_by  text,
  add column if not exists scanned_at  timestamptz;

-- History — every scan, for the timeline + "who had it when".
create table if not exists public.equipment_scans (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid references public.equipment_fleet(id) on delete set null,
  tag_code    text,
  action      text,                 -- 'checkout' | 'checkin' | 'locate' | 'register'
  by_name     text,
  by_id       uuid,
  location    text,
  lat         double precision,
  lng         double precision,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists equipment_scans_unit_idx on public.equipment_scans (unit_id, created_at desc);

comment on table public.equipment_scans is 'Scan history for tagged equipment (checkout/checkin/locate/register). Current snapshot lives on equipment_fleet.';

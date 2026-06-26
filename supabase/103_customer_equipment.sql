-- Equipment registry — structured records of the appliances at a customer's location (water heaters,
-- tankless, etc.). The plate scanner already OCRs brand/model/serial/fuel/capacity/year with Claude Vision;
-- this persists that read so it's ON FILE for the next visit (age, warranty, and the fuel-type guard carry
-- forward instead of being re-scanned every time). Keyed to the customer. RLS-locked.
create extension if not exists pgcrypto;

create table if not exists public.customer_equipment (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid,
  job_id          uuid,                 -- the visit it was captured on
  type            text,                 -- 'water heater' | 'tankless' | 'softener' | … (free text)
  brand           text,
  model           text,
  serial          text,
  fuel_type       text,                 -- 'NATURAL GAS' | 'LP / PROPANE' | 'ELECTRIC' | 'UNKNOWN'
  capacity_gallons int,
  year            int,                  -- manufacture / install year (for age)
  warranty_through date,                -- office-set; null until known
  photo_path      text,
  notes           text,
  confidence      text,                 -- the AI read confidence at capture
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists customer_equipment_cust_idx on public.customer_equipment (customer_id, created_at desc);
alter table public.customer_equipment enable row level security;

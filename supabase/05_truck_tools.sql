-- Tech "My Truck" data: van inventory + tools. Run ONCE in Supabase → SQL Editor.
create table if not exists public.truck_inventory (
  id uuid primary key default gen_random_uuid(),
  tech_name text,
  sku text,
  name text,
  qty numeric default 0,
  unit text default 'ea',
  reorder_point numeric,
  bin text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);
create table if not exists public.tools (
  id uuid primary key default gen_random_uuid(),
  name text,
  serial text,
  mfg text,
  year int,
  value numeric,
  assigned_to text,
  status text default 'on_van',
  condition_photo_url text,
  created_at timestamptz default now()
);

create index if not exists truck_inventory_tech_idx on public.truck_inventory (tech_name);
create index if not exists tools_assigned_idx on public.tools (assigned_to);

-- Protected (read server-side via service_role, like customers) until per-tech RLS in the auth phase.
alter table public.truck_inventory enable row level security;
alter table public.tools enable row level security;

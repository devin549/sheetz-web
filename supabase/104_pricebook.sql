-- Sheetz Pricebook schema draft
-- Additive/idempotent. Review before running in production.

create extension if not exists pgcrypto;

create table if not exists public.pricebook_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  parent_id uuid references public.pricebook_categories(id) on delete set null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricebook_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.pricebook_categories(id) on delete set null,
  sku text not null unique,
  name text not null,
  customer_name text,
  internal_name text,
  short_description text,
  customer_description text,
  internal_notes text,
  retail_price numeric(12,2) not null default 0,
  minimum_price numeric(12,2),
  estimated_material_cost numeric(12,2) not null default 0,
  estimated_labor_hours numeric(8,2) not null default 0,
  target_margin_pct numeric(5,2) not null default 60,
  taxable boolean not null default true,
  customer_visible boolean not null default true,
  requires_manager_approval boolean not null default false,
  active boolean not null default true,
  tags text[] not null default '{}',
  job_types text[] not null default '{}',
  warranty_text text,
  manufacturer text,
  manufacturer_part_number text,
  primary_photo_url text,
  pdf_url text,
  video_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricebook_item_aliases (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.pricebook_items(id) on delete cascade,
  phrase text not null,
  source text not null default 'manual',
  confidence numeric(5,2) not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (item_id, phrase)
);

create table if not exists public.pricebook_media (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.pricebook_items(id) on delete cascade,
  media_type text not null check (media_type in ('photo','pdf','video','manufacturer_link','internal_doc')),
  title text,
  url text not null,
  customer_visible boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.pricebook_bundles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  job_type text,
  description text,
  target_margin_pct numeric(5,2) not null default 60,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pricebook_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.pricebook_bundles(id) on delete cascade,
  item_id uuid not null references public.pricebook_items(id) on delete restrict,
  quantity numeric(12,2) not null default 1,
  required_or_optional text not null default 'optional' check (required_or_optional in ('required','optional','upsell')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (bundle_id, item_id)
);

create table if not exists public.pricebook_vendor_prices (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.pricebook_items(id) on delete cascade,
  vendor_name text not null,
  vendor_sku text,
  vendor_url text,
  last_cost numeric(12,2),
  new_cost numeric(12,2),
  approved_cost numeric(12,2),
  status text not null default 'current' check (status in ('current','needs_approval','approved','ignored')),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, vendor_name, vendor_sku)
);

create table if not exists public.pricebook_price_update_requests (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.pricebook_items(id) on delete cascade,
  old_price numeric(12,2),
  recommended_price numeric(12,2),
  old_cost numeric(12,2),
  new_cost numeric(12,2),
  reason text not null,
  source text not null default 'ai',
  status text not null default 'pending' check (status in ('pending','approved','rejected','applied')),
  requested_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.job_pricebook_usage (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  job_number text,
  dispatchme_job_id text,
  project_id uuid,
  project_number text,
  unit_id uuid,
  unit_label text,
  customer_id uuid,
  tech_id uuid,
  item_id uuid not null references public.pricebook_items(id) on delete restrict,
  quantity numeric(12,2) not null default 1,
  sold_price numeric(12,2) not null default 0,
  actual_cost numeric(12,2) not null default 0,
  estimated_labor_hours numeric(8,2) not null default 0,
  actual_labor_hours numeric(8,2) not null default 0,
  margin_pct numeric(5,2),
  source text not null default 'estimate',
  sold_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.pricebook_ai_observations (
  id uuid primary key default gen_random_uuid(),
  observation_type text not null,
  item_id uuid references public.pricebook_items(id) on delete set null,
  job_type text,
  message text not null,
  evidence jsonb not null default '{}'::jsonb,
  recommendation text,
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  status text not null default 'open' check (status in ('open','accepted','rejected','snoozed','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_pricebook_items_category on public.pricebook_items(category_id);
create index if not exists idx_pricebook_items_active on public.pricebook_items(active);
create index if not exists idx_pricebook_items_tags on public.pricebook_items using gin(tags);
create index if not exists idx_pricebook_items_job_types on public.pricebook_items using gin(job_types);
create index if not exists idx_pricebook_alias_phrase on public.pricebook_item_aliases(phrase);
create index if not exists idx_job_pricebook_usage_job on public.job_pricebook_usage(job_id);
create index if not exists idx_job_pricebook_usage_project on public.job_pricebook_usage(project_id);
create index if not exists idx_job_pricebook_usage_item on public.job_pricebook_usage(item_id);
create index if not exists idx_pricebook_observations_status on public.pricebook_ai_observations(status, priority);

create or replace view public.pricebook_margin_view as
select
  i.id,
  i.sku,
  i.name,
  i.retail_price,
  i.minimum_price,
  i.estimated_material_cost,
  i.estimated_labor_hours,
  i.target_margin_pct,
  case
    when i.retail_price <= 0 then null
    else round(((i.retail_price - i.estimated_material_cost) / i.retail_price) * 100, 2)
  end as estimated_margin_pct,
  case
    when i.retail_price <= 0 then 'missing_price'
    when ((i.retail_price - i.estimated_material_cost) / i.retail_price) * 100 < i.target_margin_pct then 'below_target'
    else 'healthy'
  end as margin_health
from public.pricebook_items i;

create or replace view public.pricebook_search_view as
select
  i.id,
  i.sku,
  i.name,
  coalesce(i.customer_name, i.name) as customer_name,
  c.name as category_name,
  i.retail_price,
  i.minimum_price,
  i.tags,
  i.job_types,
  i.active,
  string_agg(a.phrase, ' | ' order by a.phrase) as aliases
from public.pricebook_items i
left join public.pricebook_categories c on c.id = i.category_id
left join public.pricebook_item_aliases a on a.item_id = i.id and a.active = true
group by i.id, c.name;

comment on table public.pricebook_items is 'Sellable pricebook items for Sheetz estimates/invoices.';
comment on table public.pricebook_bundles is 'Common job-type bundles like drain unclog, toilet reset, water heater install.';
comment on table public.pricebook_ai_observations is 'Read-only AI learning/recommendation queue until a manager approves action.';

-- ── CB additions ────────────────────────────────────────────────────────────────────────────────────
-- Good / Better / Best customer-facing sales fields on the bundle (the spec body). Tier prices are COMPUTED
-- from which items each tier includes (pricebook_bundle_items.tiers) — Good = base drain, Better = + camera,
-- Best = + membership → the $491 / $876 / $1,025 ladder.
alter table public.pricebook_bundles add column if not exists good_option_name     text;
alter table public.pricebook_bundles add column if not exists better_option_name   text;
alter table public.pricebook_bundles add column if not exists best_option_name     text;
alter table public.pricebook_bundles add column if not exists good_best_for        text;
alter table public.pricebook_bundles add column if not exists better_best_for      text;
alter table public.pricebook_bundles add column if not exists best_best_for        text;
alter table public.pricebook_bundles add column if not exists customer_description text;
alter table public.pricebook_bundles add column if not exists warranty_text        text;
alter table public.pricebook_bundles add column if not exists customer_photo_url   text;
alter table public.pricebook_bundles add column if not exists customer_pdf_url     text;
alter table public.pricebook_bundles add column if not exists approval_button_text text default 'Approve & Schedule';
-- Which Good/Better/Best tiers include this bundle item (subset of {'good','better','best'}).
alter table public.pricebook_bundle_items add column if not exists tiers text[] not null default array['good','better','best'];

-- RLS: every pricebook table is service-role-only (the app reads via the service key + role guards in code),
-- matching the rest of the schema. No anon/auth policies = locked by default.
alter table public.pricebook_categories            enable row level security;
alter table public.pricebook_items                 enable row level security;
alter table public.pricebook_item_aliases          enable row level security;
alter table public.pricebook_media                 enable row level security;
alter table public.pricebook_bundles               enable row level security;
alter table public.pricebook_bundle_items          enable row level security;
alter table public.pricebook_vendor_prices         enable row level security;
alter table public.pricebook_price_update_requests enable row level security;
alter table public.job_pricebook_usage             enable row level security;
alter table public.pricebook_ai_observations       enable row level security;

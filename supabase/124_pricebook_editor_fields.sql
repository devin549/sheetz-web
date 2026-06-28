-- Pricebook foundation (Phase 0) — fields the full item editor + category manager need.
-- Additive + idempotent. Run ONCE in Supabase → SQL Editor. Safe to re-run.

-- ── Category images/icons (per-category tile art) ─────────────────────────────────────────────
alter table public.pricebook_categories add column if not exists image_url text;
alter table public.pricebook_categories add column if not exists icon      text;

-- ── Item editor fields (ServiceTitan field-parity) ────────────────────────────────────────────
alter table public.pricebook_items add column if not exists legal_text             text;     -- per-line disclaimer (CB's own text)
alter table public.pricebook_items add column if not exists member_price           numeric(12,2);
alter table public.pricebook_items add column if not exists add_on_price           numeric(12,2);
alter table public.pricebook_items add column if not exists member_add_on_price    numeric(12,2);
alter table public.pricebook_items add column if not exists allow_discount_codes   boolean not null default true;
alter table public.pricebook_items add column if not exists allow_membership_discount boolean not null default true;
alter table public.pricebook_items add column if not exists is_labor_service       boolean not null default false;
alter table public.pricebook_items add column if not exists cross_sale_group       text;
alter table public.pricebook_items add column if not exists gl_account             text;
alter table public.pricebook_items add column if not exists expense_account        text;
alter table public.pricebook_items add column if not exists business_unit          text;
alter table public.pricebook_items add column if not exists conversion_tags        text[] not null default '{}';
alter table public.pricebook_items add column if not exists project_label          text;

-- Tax stays OPT-IN: default the flag OFF (only applied when an estimate turns tax on, to taxable lines).
alter table public.pricebook_items alter column taxable set default false;

-- ── Recommended-upgrades / cross-sell (manual curation alongside the learned co-sells) ─────────
create table if not exists public.pricebook_item_upgrades (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.pricebook_items(id) on delete cascade,
  upgrade_id  uuid not null references public.pricebook_items(id) on delete cascade,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (item_id, upgrade_id)
);
create index if not exists pricebook_item_upgrades_item_idx on public.pricebook_item_upgrades (item_id);
alter table public.pricebook_item_upgrades enable row level security;

-- ── App settings the pricebook reads (tax rate stays 0/off until set; material guardrail %) ─────
create table if not exists public.pricebook_settings (
  id                   integer primary key default 1,
  tax_rate             numeric(6,4) not null default 0,    -- e.g. 0.06 = 6% (still off until an estimate opts in)
  material_pct_threshold numeric(5,2) not null default 20, -- flag when material > this % of the ticket
  updated_at           timestamptz not null default now(),
  check (id = 1)
);
insert into public.pricebook_settings (id) values (1) on conflict (id) do nothing;
alter table public.pricebook_settings enable row level security;

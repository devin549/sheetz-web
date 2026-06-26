-- 118 — Membership plans + member pricing. Devin's model: when offering a membership, the tech turns ON
-- member pricing on the estimate and picks the PLAN; each plan carries its own savings (a discount %).
-- The owner edits the plans + savings; nothing is per-item, so it applies across the whole 549-item book.
create table if not exists public.membership_plans (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  discount_pct  numeric(5,2) not null default 0,   -- member savings on any service (0–100)
  monthly_price numeric(12,2),                      -- optional: what the plan costs the customer
  perks         text,                               -- short customer-facing blurb
  sort_order    integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.membership_plans enable row level security;

-- A starter plan so the toggle works immediately — the owner renames it + sets the real savings.
insert into public.membership_plans (slug, name, discount_pct, monthly_price, perks, sort_order)
values ('clog-club', 'Clog Club', 15, 16, 'Member savings on every service + priority scheduling', 1)
on conflict (slug) do nothing;

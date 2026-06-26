-- Start of Day gate (HTML sod pane). Per-tech, per-day: van pre-trip + tools check-out + handbook re-ack.
-- The 3 hard gates (pre-trip, tools, handbook) must be green before the first job; helper + KY-code are
-- per-job (informational here). Additive, idempotent, RLS-locked.
create extension if not exists pgcrypto;

create table if not exists public.sod_checks (
  id                uuid primary key default gen_random_uuid(),
  tech_id           uuid,
  tech_name         text,
  day               date not null,
  -- 🚐 van pre-trip
  pretrip_done      boolean not null default false,
  odometer          int,
  gas_level         text,              -- full | 3/4 | 1/2 | 1/4 | below
  tires_ok          boolean,
  oil_ok            boolean,
  windshield_ok     boolean,
  spare_keys        boolean,
  no_text_affirm    boolean,
  -- 🧰 tools check-out
  tools_confirmed   boolean not null default false,
  tools_missing     text,              -- comma-joined identifiers reported missing
  -- 📚 handbook quarterly re-ack
  handbook_acked    boolean not null default false,
  handbook_acked_at timestamptz,
  -- gate
  completed         boolean not null default false,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists sod_checks_tech_day_idx on public.sod_checks (tech_id, day);
create index if not exists sod_checks_name_day_idx on public.sod_checks (tech_name, day);
alter table public.sod_checks enable row level security;

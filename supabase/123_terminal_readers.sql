-- 123 — Stripe Terminal (WisePOS E) card readers. Each row is a physical reader we've registered to our
-- Stripe account so a tech can collect IN PERSON at job close-out (tap/insert) instead of texting a link.
-- Server-driven: the reader talks to Stripe directly — no card data ever touches us or this DB. We only
-- keep the reader's Stripe id + a friendly label + which one is the shop default.
create table if not exists public.terminal_readers (
  id            text primary key,                       -- Stripe reader id (tmr_…)
  label         text,                                   -- friendly name e.g. "Van 7 reader"
  location_id   text,                                   -- Stripe Terminal location (tml_…)
  tech_id       uuid references public.techs(id) on delete set null, -- optional: reader assigned to one tech
  is_default    boolean not null default false,         -- the shop's go-to reader when a tech has none assigned
  status        text,                                   -- last-known online/offline (refreshed on use)
  last_seen     timestamptz,
  registered_by text,                                   -- who paired it
  created_at    timestamptz not null default now()
);

-- Only ONE default reader at a time (a partial unique index = at most one row with is_default true).
create unique index if not exists terminal_readers_one_default
  on public.terminal_readers (is_default) where is_default;

create index if not exists terminal_readers_tech on public.terminal_readers (tech_id) where tech_id is not null;

comment on table public.terminal_readers is 'Registered Stripe Terminal (WisePOS E) readers for in-person close-out collection. Server-driven; no card data stored.';

-- 112_brain_kb.sql — Plumber's Brain knowledge base.
-- The office/techs feed it real manufacturer guidance, common fixes, and Kentucky code notes; the public
-- /api/ask door grounds its answers in these entries (and cites the source). This is how the website Brain
-- "learns from Sheetz" — every entry the team adds makes it permanently smarter, with no hallucinating.
-- RLS-locked: service-role only (the public door reads it via the service key; the office UI writes via actions).
create extension if not exists pgcrypto;

create table if not exists public.brain_kb (
  id              uuid primary key default gen_random_uuid(),
  topic           text not null,                  -- short title, e.g. "Rheem relief valve dripping"
  body            text not null,                  -- the authoritative answer / manual snippet
  tags            text[] not null default '{}',   -- keywords for matching
  category        text,                           -- water heater | drain | sewer | code | disposal | faucet | general
  source_label    text,                           -- e.g. "Rheem Use & Care Manual" or "KY Plumbing Code"
  source_url      text,
  active          boolean not null default true,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists brain_kb_active_idx on public.brain_kb (active, category);

alter table public.brain_kb enable row level security;

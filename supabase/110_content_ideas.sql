-- SEO content engine — AI-recommended (and AI-drafted) local blog posts that target the towns/keywords where
-- Clog Busterz is weak or invisible in the rank tracker, to grow into them (e.g. Nicholasville, Lexington,
-- hydro jetting). Drafts live here ready to publish to the CB site. RLS-locked.
create extension if not exists pgcrypto;

create table if not exists public.content_ideas (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  target_keyword  text,
  target_town     text,
  rationale       text,                 -- why this post (the gap it attacks)
  draft           text,                 -- the AI-written post (markdown), filled on demand
  status          text not null default 'idea' check (status in ('idea','drafted','published','dismissed')),
  source          text not null default 'ai',
  published_url   text,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists content_ideas_status_idx on public.content_ideas (status, created_at desc);
create unique index if not exists content_ideas_dedupe on public.content_ideas (lower(title));
alter table public.content_ideas enable row level security;

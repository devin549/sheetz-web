-- Meetings with mandatory acknowledgment. A supervisor/GM/OM/owner sends a meeting to a crew (or
-- everyone, e.g. a Rheem training); each person must tap 👍 to acknowledge, which adds it to their
-- calendar. Senders see exactly who hasn't acked yet.
-- Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.meetings (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  starts_at     timestamptz not null,
  duration_min  int not null default 60,
  location      text,
  notes         text,
  audience      text not null default 'everyone',   -- 'everyone' | a crew name
  created_by    text,
  created_role  text,
  created_at    timestamptz not null default now()
);
create index if not exists meetings_when_idx on public.meetings (starts_at desc);

create table if not exists public.meeting_acks (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  tech_name   text not null,
  ack_at      timestamptz not null default now(),
  unique (meeting_id, tech_name)
);
create index if not exists meeting_acks_mtg_idx on public.meeting_acks (meeting_id);

alter table public.meetings enable row level security;
alter table public.meeting_acks enable row level security;

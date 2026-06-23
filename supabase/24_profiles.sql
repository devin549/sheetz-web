-- Employee profiles: one row per Supabase Auth login. The app reads role + scope from HERE
-- (server-side, service-role) before showing pages or allowing actions. This is the keystone
-- of the access model: one login → one role → one scope.
--
-- Safe to run before backfilling rows: the app falls back to auth user_metadata when a login
-- has no profile yet, so existing logins keep working. Idempotent.
-- Run in Supabase → SQL Editor.

create extension if not exists pgcrypto;

-- tech_id type is matched to techs.id (uuid on Supabase, but detected so the FK never fails).
do $$
declare tid_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into tid_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'techs' and a.attname = 'id' and not a.attisdropped;
  if tid_type is null then tid_type := 'uuid'; end if;

  execute format($ct$
    create table if not exists public.profiles (
      user_id    uuid primary key references auth.users(id) on delete cascade,
      name       text,
      email      text,
      role       text not null default 'viewer',
      tech_id    %s references public.techs(id) on delete set null,  -- techs link → tech sees only their jobs
      crew_id    text,            -- text for now (techs.crew is text); normalize to a crews table later
      active     boolean not null default true,   -- disable former employees without deleting history
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint profiles_role_chk check (role in (
        'owner','admin','dispatcher','csr','foreman','tech','viewer','customer',
        'gm','om','accounting','fs','sales','marketing','shop','helper'
      ))
    )
  $ct$, tid_type);
end $$;

create index if not exists profiles_tech_id_idx on public.profiles (tech_id) where tech_id is not null;
create index if not exists profiles_role_idx    on public.profiles (role);

-- RLS on, NO policies by design: only the server's service-role client reads/writes profiles.
-- Role + scope must never be editable from the browser, so anon/authenticated stay denied.
alter table public.profiles enable row level security;

comment on table public.profiles is
'Per-login employee profile: role + tech_id/crew_id scope + active flag. Server-authoritative; service-role only.';

-- Seed the owner so there is always one full-access login. Other staff are backfilled from /team.
insert into public.profiles (user_id, name, email, role)
select u.id, coalesce(u.raw_user_meta_data->>'name', u.email), u.email, 'owner'
from auth.users u
where lower(u.email) = 'devin@clogbusterzplumbing.com'
on conflict (user_id) do update set role = 'owner', email = excluded.email, updated_at = now();

-- Refer Opportunity to Sales — FloodBusterz / Reline lead handoff (HTML refModal). The tech spots a bigger
-- job (water damage → FloodBusterz, bad sewer line → Reline), writes what they saw, optionally attaches
-- damage photos, and one tap routes it to Sales/GM (Ronnie/Tracey) for scope approval. The CUSTOMER IS NEVER
-- CONTACTED by this — it's an internal tech→manager handoff so the opportunity never slips. RLS-locked.
create extension if not exists pgcrypto;

create table if not exists public.sales_referrals (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid,
  customer_name text,
  ref_type      text not null default 'fb' check (ref_type in ('fb','reline')),
  note          text,
  urgent        boolean not null default false,
  photo_paths   text[] not null default '{}',     -- storage paths in the job-photos bucket
  status        text not null default 'new' check (status in ('new','reviewing','approved','sold','declined')),
  tech_name     text,
  tech_id       uuid,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  reviewed_by   text,
  reviewed_at   timestamptz,
  outcome_note  text
);
create index if not exists sales_referrals_status_idx on public.sales_referrals (status, created_at desc);
create index if not exists sales_referrals_job_idx    on public.sales_referrals (job_id);
alter table public.sales_referrals enable row level security;

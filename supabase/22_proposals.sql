-- Price-book proposals (Good/Better/Best estimates). Run ONCE in Supabase → SQL Editor.
-- Ported from the live _DB_Proposals. INVARIANT: accepting a tier records the choice only — it
-- never charges. status never includes 'paid' (draft|presented|accepted|declined|expired).

create table if not exists public.proposals (
  id              text primary key,            -- PB-yymmdd-... id
  job_id          text,
  customer        text,
  is_member       boolean default false,
  tax_rate        numeric default 0,
  status          text not null default 'draft',
  recommended_key text,
  selected_key    text,
  accepted_total  numeric,
  tiers           jsonb,                        -- priced tier snapshot
  created_by      text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists proposals_created_idx on public.proposals (created_at desc);

alter table public.proposals enable row level security;

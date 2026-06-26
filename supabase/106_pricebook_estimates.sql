-- Customer-facing estimate: a sendable, token-linked snapshot the customer opens like an Apple checkout.
-- The tech builds it from the pricebook, taps Send → a clean link. The customer can Approve, Ask a question,
-- request a Deposit (office sends a secure link — we never charge here), or Decline with a reason (which spins
-- up a follow-up). The snapshot stores ONLY customer-safe fields — no cost/margin/min ever reaches this table.
create extension if not exists pgcrypto;

create table if not exists public.pricebook_estimates (
  id              uuid primary key default gen_random_uuid(),
  token           text not null unique,
  job_id          uuid,
  job_number      text,
  customer_id     uuid,
  customer_name   text,
  tech_id         uuid,
  tech_name       text,
  bundle_slug     text,
  tier_key        text,
  headline        text,                  -- e.g. "Fix + Protect"
  customer_description text,
  warranty_text   text,
  approve_text    text default 'Approve & Schedule',
  lines           jsonb not null default '[]'::jsonb,   -- [{name, description, price, includes:[], photo}]
  subtotal        numeric(12,2) not null default 0,
  card_fee        numeric(12,2) not null default 0,
  status          text not null default 'sent' check (status in ('sent','viewed','approved','question','declined','deposit_requested')),
  customer_question text,
  decline_reason  text,
  follow_up_at    date,
  responded_at    timestamptz,
  viewed_at       timestamptz,
  created_by      uuid,
  created_at      timestamptz not null default now()
);
create index if not exists pricebook_estimates_job_idx   on public.pricebook_estimates (job_id, created_at desc);
create index if not exists pricebook_estimates_status_idx on public.pricebook_estimates (status, created_at desc);
alter table public.pricebook_estimates enable row level security;

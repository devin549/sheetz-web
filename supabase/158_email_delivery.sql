-- 158 — email DELIVERY tracking + bounce detection. A wrong/dead customer email used to fail silently; now
-- every send is logged with Resend's id, a webhook updates it to delivered/bounced/complained, and a hard
-- bounce flags the customer's email so the office sees it and fixes it. Nothing falls through the cracks.
create extension if not exists pgcrypto;

create table if not exists public.email_deliveries (
  id          uuid primary key default gen_random_uuid(),
  resend_id   text,                                  -- Resend's email id → correlates the webhook back here
  to_email    text,
  customer_id uuid,
  purpose     text,                                  -- invoice | estimate | statement | booking | reschedule | other
  ref         text,                                  -- invoice #/job #/token so the office can find it
  status      text not null default 'sent',          -- sent | delivered | bounced | complained | failed
  error       text,
  sent_at     timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists email_deliveries_resend_idx on public.email_deliveries (resend_id);
create index if not exists email_deliveries_cust_idx   on public.email_deliveries (customer_id, sent_at desc);
create index if not exists email_deliveries_status_idx on public.email_deliveries (status, sent_at desc);
alter table public.email_deliveries enable row level security;

-- Customer email health — set 'bounced' / 'complained' by the webhook, cleared when the office fixes the email.
alter table public.customers
  add column if not exists email_status     text,           -- null/good | bounced | complained
  add column if not exists email_bounced_at timestamptz;

comment on column public.customers.email_status is 'Email health from delivery webhooks. bounced = the address is bad, fix it.';

-- Mass-email campaigns + per-recipient audit trail. Run ONCE in Supabase → SQL Editor.
-- The guardrail (never a one-click blast): a campaign is created as 'pending_approval', an
-- internal approver releases it, and EVERY recipient send is logged to email_sends. RLS on +
-- no policies = readable only by the server (service_role), like invoices/customers.

create table if not exists public.email_campaigns (
  id              uuid primary key default gen_random_uuid(),
  subject         text not null,
  body            text not null,
  audience        text not null,                       -- preset key (pastdue / pastdue90 / allcustomers)
  audience_label  text,
  status          text not null default 'pending_approval', -- pending_approval|approved|sending|sent|canceled
  recipient_count integer default 0,                   -- valid, will-send
  skipped_count   integer default 0,                   -- do_not_mail / no email / dupes
  send_ok         integer default 0,
  send_fail       integer default 0,
  created_by      text,
  approved_by     text,
  created_at      timestamptz default now(),
  approved_at     timestamptz,
  sent_at         timestamptz
);

create table if not exists public.email_sends (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid references public.email_campaigns(id) on delete cascade,
  customer_id   uuid,
  customer_name text,
  to_email      text,
  status        text not null default 'queued',        -- queued|sent|failed|skipped
  error         text,
  created_at    timestamptz default now(),
  sent_at       timestamptz
);
create index if not exists email_sends_campaign_idx on public.email_sends (campaign_id);

alter table public.email_campaigns enable row level security;
alter table public.email_sends     enable row level security;

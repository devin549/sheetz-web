-- CRM spine: every touch with a customer — calls, notes, follow-ups, complaints, promises — optionally
-- linked to a job/invoice/estimate/review/lead. Replaces free-text tasks with owned, due-dated
-- follow-ups tied to a customer. Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.customer_interactions (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid,
  customer_name text,
  kind          text not null default 'note',   -- call | note | followup | sms | email | visit | complaint | promise
  summary       text,
  link_type     text,                            -- job | invoice | estimate | review | lead
  link_id       text,
  due_date      date,                            -- set → it's an open follow-up
  status        text not null default 'done',    -- followups start 'open'; logged touches are 'done'
  owner         text,
  created_by    text,
  created_at    timestamptz not null default now(),
  done_at       timestamptz
);
create index if not exists cust_inter_customer_idx on public.customer_interactions (customer_id, created_at desc);
create index if not exists cust_inter_followup_idx on public.customer_interactions (status, due_date);

alter table public.customer_interactions enable row level security;

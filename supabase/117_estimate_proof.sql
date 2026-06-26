-- 117 — Approval-as-proof for pricebook estimates. Anti-dispute: when a customer (or a landlord/owner
-- out of state) approves, we capture WHO approved, HOW (clean link on their phone, in person on the
-- tech's iPad, or verbally over the phone logged by the tech), the exact consent wording they agreed to,
-- the device/IP, and a full immutable event timeline. So "I never approved that" can't stick.

-- Proof fields on the estimate snapshot (all additive / idempotent).
alter table public.pricebook_estimates add column if not exists approved_name        text;   -- typed full name of the approver
alter table public.pricebook_estimates add column if not exists approval_method      text;   -- 'link' | 'in_person' | 'phone' | 'text' | 'email'
alter table public.pricebook_estimates add column if not exists approver_ip          text;
alter table public.pricebook_estimates add column if not exists approver_user_agent  text;
alter table public.pricebook_estimates add column if not exists consent_text         text;   -- the exact sentence they agreed to
alter table public.pricebook_estimates add column if not exists approval_proof_url   text;   -- optional recording / screenshot
alter table public.pricebook_estimates add column if not exists witnessed_by_tech_id uuid;   -- tech who logged a phone/in-person approval
alter table public.pricebook_estimates add column if not exists witnessed_by_name    text;

-- Full comms / proof timeline — one row per touch. Never updated, only inserted (append-only audit).
create table if not exists public.pricebook_estimate_events (
  id           uuid primary key default gen_random_uuid(),
  estimate_id  uuid not null references public.pricebook_estimates(id) on delete cascade,
  token        text,
  event_type   text not null,   -- sent | viewed | approved | question | declined | deposit_requested | phone_approval | note
  method       text,            -- link | in_person | phone | text | email
  actor        text,            -- customer name or staff name
  actor_role   text,            -- customer | tech | office
  ip           text,
  user_agent   text,
  note         text,
  amount       numeric(12,2),
  proof_url    text,
  created_at   timestamptz not null default now()
);
create index if not exists pbk_estimate_events_idx on public.pricebook_estimate_events (estimate_id, created_at);
alter table public.pricebook_estimate_events enable row level security;

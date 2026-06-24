-- Closeout v2 — the disposition checklist beyond photos/QA: payment, signature, invoice/receipt,
-- review request, cash custody, warranty packet. One row per job. Idempotent. Run in the SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.job_closeout (
  job_id              uuid primary key,
  payment_disposition text,                 -- paid_card | paid_cash | check | invoiced | warranty | cod | no_charge
  signed              boolean not null default false,
  signed_by           text,
  invoice_status      text,                 -- none | sent | receipt_given
  review_requested    boolean not null default false,
  cash_status         text,                 -- n/a | pending | turned_in
  warranty_packet     boolean not null default false,
  note                text,
  closed_at           timestamptz,
  closed_by           text,
  updated_by          text,
  updated_at          timestamptz not null default now()
);

alter table public.job_closeout enable row level security;

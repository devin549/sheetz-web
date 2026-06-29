-- 137 — Subcontractor verification on scanned bills. A scanned doc that's a SUBCONTRACTOR's labor invoice
-- (not a parts receipt) must be verified by accounting BEFORE the sub is paid — same control as the no-auto-
-- pay-external rule. The scanner (field crew or office) hits "Confirm sub"; it lands in accounting's queue
-- as pending_verify; accounting clears it to pay (payment happens in AP/QuickBooks) or rejects it. We gate
-- and audit — we do not move money.
alter table public.receipt_entries
  add column if not exists is_subcontractor  boolean not null default false,
  add column if not exists sub_status        text,                 -- null | 'pending_verify' | 'cleared' | 'rejected'
  add column if not exists sub_name          text,                 -- which subcontractor (AI guess or entered)
  add column if not exists sub_confirmed_by  text,
  add column if not exists sub_confirmed_at  timestamptz,
  add column if not exists sub_verified_by   text,                 -- accounting who cleared/rejected
  add column if not exists sub_verified_at   timestamptz,
  add column if not exists sub_reject_reason text;

-- Accounting's "subs awaiting verification" queue — fast lookup of the held bills.
create index if not exists receipt_entries_sub_pending
  on public.receipt_entries (sub_status) where is_subcontractor and sub_status = 'pending_verify';

comment on column public.receipt_entries.sub_status is
  'Subcontractor verification gate: pending_verify (held, do not pay) -> cleared (accounting OK, pay via AP) | rejected.';

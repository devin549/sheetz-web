-- 138 — Receipt ↔ work-order reconciliation flags (the "one warning, then the fee" ledger). When a job's
-- material cost has no matching receipt (missing) or the receipt doesn't match the booked cost (mismatch),
-- a flag lands here against the tech. Their FIRST flag is a warning; every one after is a Doc Fraud Fee and
-- the work is flagged for review. One row per (job, kind) so re-running reconciliation never double-flags.
create table if not exists public.receipt_flags (
  id          uuid primary key default gen_random_uuid(),
  job_id      text,
  job_number  text,
  tech_id     uuid,
  tech_name   text,
  kind        text not null,                       -- receipt_missing | receipt_mismatch
  level       text not null,                       -- warning | fee
  detail      jsonb,
  status      text not null default 'open',        -- open | resolved | waived
  created_at  timestamptz not null default now(),
  resolved_by text,
  resolved_at timestamptz,
  unique (job_id, kind)
);
create index if not exists receipt_flags_open on public.receipt_flags (status) where status = 'open';
create index if not exists receipt_flags_tech on public.receipt_flags (tech_id);

comment on table public.receipt_flags is 'Receipt↔work-order discrepancies per tech. 1st = warning, then Doc Fraud Fee. Source of truth = the web hub.';

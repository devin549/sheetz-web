-- 135 — "Bill from office" customer flag. Commercial accounts, property managers, landlords, recurring
-- partners: the tech collects NOTHING on site; the office invoices them. This is the master "who collects"
-- switch (office vs tech); net_terms_days (migration 132) is the WHEN ("due on receipt" = 0, else net-N).
-- An office-billed job's close-out is satisfied by a "billed_office" disposition — no on-site payment needed.
alter table public.customers
  add column if not exists bill_from_office     boolean not null default false,
  add column if not exists bill_from_office_by  text,
  add column if not exists bill_from_office_at  timestamptz;

comment on column public.customers.bill_from_office is
  'When true, the tech never collects on site — the office invoices this customer (net_terms_days = the due window). Set by owner/GM/accounting.';

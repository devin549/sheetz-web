-- 💳 Invoice due date — set when an approved estimate becomes an invoice (now, or +Net-30/15). Lets AR /
-- past-due chase by the real due date instead of the create date. Append-only, safe to re-run.
alter table public.invoices add column if not exists due_date timestamptz;
create index if not exists invoices_due_date_idx on public.invoices (due_date) where due_date is not null;

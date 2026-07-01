-- 167 — invoice due_date (Net-30 / payment terms). Without this column billNet30's fail-soft retry silently
-- DROPS the due date (the invoice reopens with no date), and /api/cron/ar (the daily 9am ET "Net-30 chases
-- itself" reminder) has nothing to remind on. Date-only; NULL = due on receipt — the ~1k legacy-imported
-- ServiceTitan rows stay NULL so the reminder cron never floods the office with ancient invoices.
alter table public.invoices add column if not exists due_date date;

-- The cron's exact lookup: open balance + a due date coming due. Partial index keeps it tiny (legacy NULLs
-- and paid rows excluded).
create index if not exists invoices_due_open_idx
  on public.invoices (due_date)
  where balance > 0 and due_date is not null;

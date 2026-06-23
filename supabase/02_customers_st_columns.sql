-- Add ServiceTitan customer fields to the customers table. Run ONCE in Supabase → SQL Editor.
alter table public.customers
  add column if not exists st_customer_id     text,
  add column if not exists type               text,
  add column if not exists phone              text,
  add column if not exists do_not_mail        boolean,
  add column if not exists do_not_service     boolean,
  add column if not exists tags               text,
  add column if not exists last_job_completed date,
  add column if not exists lifetime_revenue   numeric,
  add column if not exists lifetime_jobs      integer,
  add column if not exists lifetime_invoices  integer;

-- ST Customer ID is the natural key — your past-due INVOICES will link to customers on it.
-- Unique so re-imports upsert cleanly + invoices can reference it.
create unique index if not exists customers_st_id_idx on public.customers (st_customer_id);

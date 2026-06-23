-- Add the columns the ServiceTitan AR (Accounts Receivable Detail) data needs to the invoices table.
-- The table starts bare (id · created_at · updated_at · status · job_id). Run ONCE in Supabase SQL Editor.

alter table public.invoices
  add column if not exists st_invoice_id   text,
  add column if not exists customer_id     uuid,     -- linked to public.customers(id) by the loader (no hard FK, so unmatched rows still import)
  add column if not exists st_customer_id  text,     -- the ST Customer Id, kept for reference / re-linking
  add column if not exists invoice_number  text,
  add column if not exists invoice_date    date,
  add column if not exists total           numeric,  -- original invoice total
  add column if not exists balance         numeric,  -- amount STILL OWED (the past-due number)
  add column if not exists business_unit   text,
  add column if not exists location        text,
  add column if not exists city            text,
  add column if not exists street          text,
  add column if not exists zip             text,
  add column if not exists notes           text;

create unique index if not exists invoices_st_id_idx    on public.invoices (st_invoice_id);
create index        if not exists invoices_customer_idx on public.invoices (customer_id);
create index        if not exists invoices_balance_idx  on public.invoices (balance);

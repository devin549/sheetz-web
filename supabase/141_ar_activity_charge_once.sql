-- 141 — Make reader-charge recording atomic. The reader poll confirms a paid charge and records it; a
-- multi-tab/device poll race could otherwise post the AR ledger twice. This unique index lets the FIRST
-- insert win and a duplicate fail, so recordPaidOnce can claim-then-proceed (idempotent on the PaymentIntent).
create unique index if not exists ar_activity_reader_charge_once
  on public.ar_activity (action, invoice_number)
  where invoice_number is not null and action = 'reader_charge_paid';

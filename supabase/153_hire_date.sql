-- 153 — hire_date: the missing input the whole PTO ledger hangs on.
-- Vacation is earned on the HIRE ANNIVERSARY (5 days, use-it-or-lose-it) and paid holidays start after 90 days,
-- so we need each employee's actual start date. Until this turn it wasn't stored anywhere — the /pto vacation
-- balance was a hardcoded '40 hrs' placeholder. lib/pto.js now computes the real balance from this column.
--
-- Lives on pay_profiles (already the per-employee comp record: pay_type, rates). Idempotent.
alter table public.pay_profiles
  add column if not exists hire_date date;   -- employee start date → anniversary vacation grant + 90-day holiday eligibility

comment on column public.pay_profiles.hire_date is 'Employee start date. Drives the 1-yr-anniversary vacation grant (5 days, use-it-or-lose-it) and the 90-day paid-holiday eligibility. Set by the office.';

-- 155 — capture CHECK details at close-out. When a customer pays by check, CB policy is to write the check
-- number + the customer's ID (driver's license) on the check and record both. These live on job_closeout
-- next to payment_disposition='check'. Idempotent.
alter table public.job_closeout
  add column if not exists check_number text,   -- the check number
  add column if not exists check_id     text;   -- the ID/DL number written on the check

comment on column public.job_closeout.check_number is 'Check number when paid by check.';
comment on column public.job_closeout.check_id is 'Customer ID / driver''s license written on the check (CB policy).';

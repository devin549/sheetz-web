-- 157 — secondary customer email. Every customer-facing email (estimate, statement, booking confirm,
-- reschedule) also CC's this address, so if one inbox misses it (spam, typo, old address) the other catches
-- it. Set by the office on the customer record. Idempotent.
alter table public.customers
  add column if not exists email2 text;   -- secondary / CC email (spouse, property manager, accountant…)

comment on column public.customers.email2 is 'Secondary email — CC''d on all customer-facing emails so the customer doesn''t miss them.';

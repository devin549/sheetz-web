-- Give every customer a clean CB customer number (CB-10001, CB-10002, …) — your own identity,
-- independent of ServiceTitan. NEW customers auto-get the next number. Run ONCE in Supabase → SQL Editor.

-- 1. the column
alter table public.customers add column if not exists cb_number bigint;

-- 2. backfill existing customers with sequential numbers, in a stable order
with ordered as (
  select id, 10000 + row_number() over (order by created_at nulls first, name) as n
  from public.customers
  where cb_number is null
)
update public.customers c set cb_number = o.n from ordered o where c.id = o.id;

-- 3. a sequence so NEW customers continue from the highest number assigned
create sequence if not exists customers_cb_seq;
select setval('customers_cb_seq', (select coalesce(max(cb_number), 10000) from public.customers));
alter table public.customers alter column cb_number set default nextval('customers_cb_seq');

-- 4. each CB number is unique
create unique index if not exists customers_cb_number_idx on public.customers (cb_number);

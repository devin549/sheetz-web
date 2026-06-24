-- Tie reviews to the customer/tech records + add recovery ownership and request status. Idempotent.
alter table public.reviews add column if not exists customer_id    uuid;
alter table public.reviews add column if not exists tech_id        uuid;
alter table public.reviews add column if not exists recovery_owner text;
alter table public.reviews add column if not exists request_status text default 'none';  -- none | requested | received
create index if not exists reviews_customer_idx on public.reviews (customer_id);
create index if not exists reviews_tech_idx on public.reviews (tech_id);

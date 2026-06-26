-- 116_tech_home.sql — a tech's home address (geocoded) so Start of Day can compute "leave by" time.
alter table public.profiles add column if not exists home_address text;
alter table public.profiles add column if not exists home_lat double precision;
alter table public.profiles add column if not exists home_lng double precision;

-- Shell architecture: one user can work in more than one shell (e.g. an owner who sometimes runs a field
-- job). field_mode_enabled = may use the Tech shell; shop_mode_enabled = may use the Shop shell.
-- The hostname/shell only changes which UI renders — permissions still come from `role`.
-- Idempotent. Run in the Supabase SQL editor.
alter table public.profiles add column if not exists field_mode_enabled boolean not null default false;
alter table public.profiles add column if not exists shop_mode_enabled  boolean not null default false;

-- Tech identity: a scanned driver's-license-on-file so AI/office can confirm the device + account belong to
-- this person. We store ONLY name + expiry + state (never the license number / DOB / address) plus the image
-- in a PRIVATE bucket (service-role only). Idempotent. Run in the Supabase SQL editor.
alter table public.profiles add column if not exists license_on_file    boolean not null default false;
alter table public.profiles add column if not exists license_name       text;
alter table public.profiles add column if not exists license_expiry     text;
alter table public.profiles add column if not exists license_state      text;
alter table public.profiles add column if not exists license_scanned_at timestamptz;

insert into storage.buckets (id, name, public)
values ('tech-ids', 'tech-ids', false)
on conflict (id) do nothing;

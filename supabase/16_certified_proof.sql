-- Certified-mail evidence: tracking # + scanned return-receipt (green card) proof of delivery.
-- Run ONCE in Supabase → SQL Editor.

-- 1. Extra fields on the collections log for the certified-mail loop.
alter table public.collections_log
  add column if not exists tracking_number text,
  add column if not exists proof_path      text,        -- storage path to the scanned green card
  add column if not exists delivered_at     date;        -- date USPS shows delivered / card signed

-- 2. Private bucket for scanned delivery receipts (read server-side via signed URLs).
insert into storage.buckets (id, name, public)
values ('collections-evidence', 'collections-evidence', false)
on conflict (id) do nothing;

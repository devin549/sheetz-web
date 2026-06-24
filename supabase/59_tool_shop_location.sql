-- Which shop a tool sits in when it's checked back in (Richmond vs Lexington), so Hank can answer
-- "is there a camera at the Lexington shop?" and point someone at the right place.
-- Idempotent. Run in the Supabase SQL editor.
alter table public.tools add column if not exists shop_location text;

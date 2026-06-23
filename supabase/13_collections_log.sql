-- Collections contact log — ported from the Accounting Sheet's `_CollectionsLog`. Every contact
-- attempt on a past-due account (text / email / call / certified letter) is recorded here, so a
-- customer has a full collections TIMELINE that escalates toward the lien / lawyer packet.
-- Idempotent. Run in the Supabase SQL editor.

create table if not exists public.collections_log (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid,
  channel       text not null,          -- text | email | call | letter | certified | packet
  direction     text default 'out',     -- out | in
  note          text,
  amount        numeric,                -- balance at time of contact
  aging_bucket  text,                   -- 0-30 | 31-60 | 61-90 | 90-180 | 180+
  by_email      text,                   -- stamped server-side
  created_at    timestamptz not null default now()
);
create index if not exists collections_log_customer on public.collections_log (customer_id, created_at desc);
alter table public.collections_log enable row level security;

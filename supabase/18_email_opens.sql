-- Email open tracking (like ServiceTitan / FieldEdge) — a 1x1 pixel in each sent email pings
-- /api/track/open, which stamps these columns. Run ONCE in Supabase → SQL Editor.
-- Note: opens are directional (mail clients that block/proxy images skew the count) — same caveat
-- ST/FieldEdge have. Treat "opened" as a strong signal, not proof.

alter table public.email_sends
  add column if not exists opened_at      timestamptz,   -- first open
  add column if not exists last_opened_at timestamptz,
  add column if not exists open_count     integer default 0;

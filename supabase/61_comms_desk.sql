-- Comms Desk: a triage layer on top of the raw #sheetz feed.
--  • resolved_at/by : "Resolve" a message (clear it from the desk) — replaces the scary ✕ delete.
--  • attachments    : image/file URLs pulled from Discord, shown as thumbnails (not raw card dumps).
-- Plus employee identity for avatars + Discord matching.
-- Idempotent. Run in the Supabase SQL editor.

alter table public.cb_comms add column if not exists resolved_at  timestamptz;
alter table public.cb_comms add column if not exists resolved_by  text;
alter table public.cb_comms add column if not exists attachments  jsonb;

alter table public.techs add column if not exists photo_url        text;
alter table public.techs add column if not exists discord_name     text;
alter table public.techs add column if not exists discord_user_id  text;

create index if not exists cb_comms_open_idx
  on public.cb_comms (created_at desc)
  where deleted_at is null and resolved_at is null;

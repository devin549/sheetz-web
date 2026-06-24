-- Two-way Discord ("Captain Hook") + a tidy feed.
--  • from_name  : who actually sent it (Discord author for inbound; falls back to sent_by for outbound).
--  • deleted_at / deleted_by : soft-delete so a manager can clean the feed WITHOUT losing the audit trail.
--  • partial unique index on provider_id : the Discord message id, so re-polling never duplicates a message.
-- Idempotent. Run in the Supabase SQL editor.

alter table public.cb_comms add column if not exists from_name  text;
alter table public.cb_comms add column if not exists deleted_at timestamptz;
alter table public.cb_comms add column if not exists deleted_by text;

-- Dedup inbound Discord messages by their Discord message id (stored in provider_id).
create unique index if not exists cb_comms_discord_in_uq
  on public.cb_comms (provider_id)
  where channel = 'discord' and direction = 'in' and provider_id is not null;

-- Feed queries skip soft-deleted rows; index keeps that fast.
create index if not exists cb_comms_live_idx
  on public.cb_comms (created_at desc)
  where deleted_at is null;

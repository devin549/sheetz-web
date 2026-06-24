-- Hank-in-the-chat: let the AI teammate read #sheetz and answer ONLY when he can help.
--  • hank_seen_at : inbound messages Hank has already considered (so he never re-answers or spams).
--  • reply_to     : on Hank's own outbound replies, the Discord message id he was answering (threading).
-- Idempotent. Run in the Supabase SQL editor.

alter table public.cb_comms add column if not exists hank_seen_at timestamptz;
alter table public.cb_comms add column if not exists reply_to    text;

-- Fast "what hasn't Hank looked at yet" scan over inbound Discord.
create index if not exists cb_comms_hank_unseen_idx
  on public.cb_comms (created_at desc)
  where channel = 'discord' and direction = 'in' and hank_seen_at is null;

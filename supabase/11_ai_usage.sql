-- Per-role AI usage log — every Claude call records role, screen, tokens. Feeds a GM/Owner
-- "what is each position's AI doing + spend" dashboard. Idempotent. Run in the Supabase SQL editor.

create table if not exists public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  role          text,
  screen        text,                 -- e.g. 'ask-board', 'receipt-ocr'
  model         text,
  input_tokens  int default 0,
  output_tokens int default 0,
  user_email    text,
  created_at    timestamptz not null default now()
);
create index if not exists ai_usage_created on public.ai_usage (created_at);
create index if not exists ai_usage_role    on public.ai_usage (role);
alter table public.ai_usage enable row level security;

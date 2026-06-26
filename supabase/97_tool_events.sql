-- Tool lifecycle ledger — every event on a tool, kept FOREVER (even after the tool is retired/scrapped):
-- issued → loaned → returned → broke → repaired → lost → retired. Each stamps who had it, who logged it,
-- the condition photo, and the cost. Powers the per-tech accountability report (who breaks / loses stuff).
-- tool_name is denormalized so the history survives even if the tool row is deleted. Additive, RLS-locked.
create extension if not exists pgcrypto;
create table if not exists public.tool_events (
  id              uuid primary key default gen_random_uuid(),
  tool_id         uuid,
  tool_name       text,
  event           text not null check (event in ('added','issued','loaned','returned','broke','repaired','lost','retired','reacked','found')),
  holder_name     text,            -- the tech responsible at this event (who had it / who it went to)
  holder_id       uuid,
  by_name         text,            -- who logged it (shop manager / owner)
  by_id           uuid,
  condition_photo text,            -- bucket path or URL
  cost_cents      bigint not null default 0,   -- loss value or repair cost
  note            text,
  created_at      timestamptz not null default now()
);
create index if not exists tool_events_tool_idx   on public.tool_events (tool_id, created_at desc);
create index if not exists tool_events_holder_idx on public.tool_events (holder_name, event);
alter table public.tool_events enable row level security;

-- A couple of tracking fields on the tool itself for quick status reads (history lives in tool_events).
alter table public.tools add column if not exists issued_to    text;
alter table public.tools add column if not exists retired_at   timestamptz;

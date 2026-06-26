-- Tool registry upgrade (audit #7): the system LEARNS that field names map to the same tool — "seesnake",
-- "big reel", "sewer camera", "camera" all point to the RIDGID SeeSnake. Plus category + a scan identifier
-- and who's held it since. Builds on the existing public.tools table (05_truck_tools.sql). Idempotent.
alter table public.tools add column if not exists category    text;
alter table public.tools add column if not exists identifier  text;   -- barcode / asset tag
alter table public.tools add column if not exists holder_since timestamptz;

create table if not exists public.tool_aliases (
  id          uuid primary key default gen_random_uuid(),
  tool_id     uuid not null references public.tools(id) on delete cascade,
  alias       text not null,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists tool_aliases_tool_idx on public.tool_aliases (tool_id);
create index if not exists tool_aliases_alias_idx on public.tool_aliases (lower(alias));

alter table public.tool_aliases enable row level security;

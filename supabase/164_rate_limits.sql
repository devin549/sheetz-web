-- 164 — a global rate limiter (audit gap: "no rate limiter anywhere in the codebase"). Unauthenticated
-- endpoints that fire PAID work (Anthropic vision on /api/book + /api/flood-lead + /api/scan-plate, AI on
-- /api/roast + /api/ask) had no per-caller throttle → an attacker could run up the office API bill or spam the
-- board/Discord. This is a durable, atomic counter (works across serverless instances, unlike in-memory).
--
-- rl_hit(key, window_sec, max) → true if the call is ALLOWED (count within the window ≤ max), false if over.
-- One upsert = atomic; no read-modify-write race. Callers FAIL OPEN if this function is missing (see lib/rateLimit.js).
create table if not exists public.rate_hits (
  key          text   not null,
  window_start bigint not null,          -- epoch-second bucket start
  count        int    not null default 0,
  primary key (key, window_start)
);
alter table public.rate_hits enable row level security;   -- service-role only, like the rest of the schema

create or replace function public.rl_hit(p_key text, p_window_sec int, p_max int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  bucket bigint := (floor(extract(epoch from now()) / p_window_sec) * p_window_sec)::bigint;
  c int;
begin
  insert into public.rate_hits(key, window_start, count) values (p_key, bucket, 1)
    on conflict (key, window_start) do update set count = public.rate_hits.count + 1
    returning count into c;
  return c <= p_max;
end $$;

-- Optional housekeeping (old buckets are harmless but accumulate) — run occasionally or from a cron:
--   delete from public.rate_hits where window_start < extract(epoch from now()) - 86400;

-- Cancel-with-reason log + per-job duration (matches the live board's _DB_Cancellations +
-- _DB_JobDurations). A cancel must capture WHY (fixed reason taxonomy) so the AI can trend causes
-- + lost revenue. Idempotent. Run in the Supabase SQL editor.

create table if not exists public.cancellations (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid,
  reason_code  text not null,        -- CUSTOMER_RESCHEDULED, PRICE_TOO_HIGH, CHOSE_COMPETITOR, …
  reason_note  text,
  cancelled_by text,                 -- stamped server-side, never client
  created_at   timestamptz not null default now()
);
create index if not exists cancellations_created on public.cancellations (created_at);
alter table public.cancellations enable row level security;

alter table public.jobs add column if not exists duration_min int;  -- expected minutes on site

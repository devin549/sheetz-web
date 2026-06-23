-- Plunger Pete — AI voice-call log + queue (Vapi). Run ONCE in Supabase → SQL Editor.
-- Mirrors the Owner Sheet _VapiCallTranscripts + pipeline Vapi columns. Safety rails live in code
-- (lib/pete.js + actions.js): TEST calls only dial an internal allowlist; REAL customer calls must
-- be released by an internal approver; every call is logged here with recording + outcome.
-- RLS on + no policies = server-only reads (service_role), like the other protected tables.

create table if not exists public.pete_calls (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid,
  customer_name text,
  to_phone      text,                                  -- E.164 (+1…)
  purpose       text not null,                         -- collections | warranty | followup
  script_note   text,                                  -- context handed to the AI assistant
  status        text not null default 'queued',        -- queued|approved|calling|completed|failed|canceled
  is_test       boolean default false,                 -- dialed an internal test number
  vapi_call_id  text,
  recording_url text,
  summary       text,
  ended_reason  text,
  duration_s    integer,
  requested_by  text,
  approved_by   text,
  created_at    timestamptz default now(),
  called_at     timestamptz,
  ended_at      timestamptz
);
create index if not exists pete_calls_vapi_idx on public.pete_calls (vapi_call_id);
create index if not exists pete_calls_created_idx on public.pete_calls (created_at desc);

alter table public.pete_calls enable row level security;

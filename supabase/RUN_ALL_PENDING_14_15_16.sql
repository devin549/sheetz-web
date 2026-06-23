-- ════════════════════════════════════════════════════════════════════════════
-- CB Sheetz — ALL PENDING MIGRATIONS (14 + 15 + 16 + 17 + 18 + 19 + 20) in one paste.
-- Run ONCE in Supabase → SQL Editor → paste → Run. Safe to re-run (idempotent:
-- every statement is `if not exists` / `on conflict do nothing`).
--
-- Unlocks: 📣 Mass Email (14) · 📞 Plunger Pete AI calling (15) · 📜 Certified-mail
-- demand letter + scanned delivery-receipt proof (16) · 🗂️ board move audit (17) ·
-- 📭 email open tracking (18) · 📝 per-customer A/R notes (19) · 🚫 doubtful/bad-debt (20).
-- ════════════════════════════════════════════════════════════════════════════


-- ── 14 · Mass-email campaigns + per-recipient audit trail ────────────────────
create table if not exists public.email_campaigns (
  id              uuid primary key default gen_random_uuid(),
  subject         text not null,
  body            text not null,
  audience        text not null,                            -- pastdue / pastdue90 / allcustomers
  audience_label  text,
  status          text not null default 'pending_approval', -- pending_approval|approved|sending|sent|canceled
  recipient_count integer default 0,
  skipped_count   integer default 0,                        -- do_not_mail / no email / dupes
  send_ok         integer default 0,
  send_fail       integer default 0,
  created_by      text,
  approved_by     text,
  created_at      timestamptz default now(),
  approved_at     timestamptz,
  sent_at         timestamptz
);

create table if not exists public.email_sends (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid references public.email_campaigns(id) on delete cascade,
  customer_id   uuid,
  customer_name text,
  to_email      text,
  status        text not null default 'queued',             -- queued|sent|failed|skipped
  error         text,
  created_at    timestamptz default now(),
  sent_at       timestamptz
);
create index if not exists email_sends_campaign_idx on public.email_sends (campaign_id);

alter table public.email_campaigns enable row level security;
alter table public.email_sends     enable row level security;


-- ── 15 · Plunger Pete — AI voice-call log + queue (Vapi) ─────────────────────
create table if not exists public.pete_calls (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid,
  customer_name text,
  to_phone      text,                                       -- E.164 (+1…)
  purpose       text not null,                              -- collections | warranty | followup
  script_note   text,
  status        text not null default 'queued',             -- queued|approved|calling|completed|failed|canceled
  is_test       boolean default false,
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
create index if not exists pete_calls_vapi_idx    on public.pete_calls (vapi_call_id);
create index if not exists pete_calls_created_idx on public.pete_calls (created_at desc);

alter table public.pete_calls enable row level security;


-- ── 16 · Certified-mail tracking + scanned return-receipt proof of delivery ──
alter table public.collections_log
  add column if not exists tracking_number text,
  add column if not exists proof_path      text,            -- storage path to the scanned green card
  add column if not exists delivered_at     date;

insert into storage.buckets (id, name, public)
values ('collections-evidence', 'collections-evidence', false)
on conflict (id) do nothing;


-- ── 17 · Board move/activity audit (reassign / reschedule history) ───────────
create table if not exists public.job_moves (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid,
  action         text,                 -- assign | reassign | unassign | reschedule
  from_tech_id   uuid,
  from_tech_name text,
  to_tech_id     uuid,
  to_tech_name   text,
  scheduled_at   timestamptz,
  by_email       text,
  created_at     timestamptz default now()
);
create index if not exists job_moves_job_idx     on public.job_moves (job_id);
create index if not exists job_moves_created_idx on public.job_moves (created_at desc);

alter table public.job_moves enable row level security;


-- ── 18 · Email open tracking (ServiceTitan / FieldEdge–style pixel) ──────────
alter table public.email_sends
  add column if not exists opened_at      timestamptz,
  add column if not exists last_opened_at timestamptz,
  add column if not exists open_count     integer default 0;


-- ── 19 · Per-customer A/R notes (Ashley's "Notes" column) ────────────────────
create table if not exists public.ar_notes (
  customer_id uuid primary key,
  note        text,
  updated_by  text,
  updated_at  timestamptz default now()
);
alter table public.ar_notes enable row level security;


-- ── 20 · Doubtful / bad-debt flag on invoices (excluded from collectible AR) ─
alter table public.invoices
  add column if not exists doubtful    boolean default false,
  add column if not exists doubtful_at timestamptz,
  add column if not exists doubtful_by text;
create index if not exists invoices_doubtful_idx on public.invoices (doubtful) where doubtful;

-- ════════════════════════════════════════════════════════════════════════════
-- Done. Expected result: no errors. Verify (optional):
--   select count(*) from public.email_campaigns;   -- 0
--   select count(*) from public.pete_calls;         -- 0
--   select column_name from information_schema.columns
--     where table_name='collections_log' and column_name in
--     ('tracking_number','proof_path','delivered_at');   -- 3 rows
--   select id from storage.buckets where id='collections-evidence';  -- 1 row
-- ════════════════════════════════════════════════════════════════════════════

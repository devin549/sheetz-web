-- P8 — Job segments + crew + helper pairing + waste accountability. The model: a JOB can have many
-- SEGMENTS (sessions) under it — a second tech, a helper, a parts run, a return visit, a unit/phase, a
-- callback. Segments NEVER create a separate customer job; all labor/parts/photos/receipts roll up to the
-- parent job. Idempotent + additive + RLS-locked (service-role only; the server gates by role).
create extension if not exists pgcrypto;

-- ── SEGMENTS ──────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.job_segments (
  id                uuid primary key default gen_random_uuid(),
  parent_job_id     uuid not null,
  segment_no        text,                          -- internal, e.g. "104812-B" (parent number + letter)
  kind              text not null default 'work_segment'
                    check (kind in ('work_segment','second_tech','helper','return_visit','unit_phase','callback','parts_run')),
  assigned_tech_id  uuid,
  assigned_tech_name text,
  reason            text,
  scheduled_at      timestamptz,
  est_duration_min  int,
  -- live_not_active = on the board + assignable + may block capacity, but NOT a booked job, NO invoice,
  -- NO customer text; rolls up to the parent. active = clock running + attaching to this segment.
  status            text not null default 'draft'
                    check (status in ('draft','live_not_active','active','done','cancelled')),
  notes             text,
  unit_id           uuid,
  unit_label        text,
  started_at        timestamptz,                   -- labor clock start (set when it goes active)
  ended_at          timestamptz,
  labor_min         int,                           -- frozen on done (else compute live from started_at)
  lat               double precision,
  lng               double precision,
  billable          boolean not null default true,
  counts_capacity   boolean not null default false, -- dispatch may choose to block the tech's capacity
  created_by        uuid,
  created_by_name   text,
  created_at        timestamptz not null default now()
);
create index if not exists job_segments_parent_idx on public.job_segments (parent_job_id, created_at);
create index if not exists job_segments_tech_idx   on public.job_segments (assigned_tech_id, status);
create index if not exists job_segments_board_idx  on public.job_segments (status, scheduled_at);
alter table public.job_segments enable row level security;

-- Photos attribute to a segment (who shot it on which session). Additive; the photo spine is unchanged.
alter table public.job_photos add column if not exists segment_id uuid;
create index if not exists job_photos_segment_idx on public.job_photos (segment_id);

-- ── FIELD RECEIPTS — any assigned tech captures; updates job cost + margin immediately ──────────────
create table if not exists public.job_receipts (
  id                 uuid primary key default gen_random_uuid(),
  parent_job_id      uuid not null,
  segment_id         uuid,
  unit_id            uuid,
  uploaded_by_tech_id uuid,
  uploaded_by_name   text,
  vendor             text,
  total_cents        bigint not null default 0,
  line_items         jsonb not null default '[]'::jsonb,  -- from OCR when available
  captured_at        timestamptz,
  lat                double precision,
  lng                double precision,
  photo_bucket       text,
  photo_path         text,
  billable           boolean not null default true,
  paid_by            text check (paid_by in ('company_card','cash','reimbursement','vendor_account')),
  created_at         timestamptz not null default now()
);
create index if not exists job_receipts_parent_idx  on public.job_receipts (parent_job_id);
create index if not exists job_receipts_segment_idx on public.job_receipts (segment_id);
alter table public.job_receipts enable row level security;

-- ── HELPER PAIRING — helper tags the lead tech; lead accepts/disputes; auto-active if undisputed ─────
create table if not exists public.helper_pairings (
  id              uuid primary key default gen_random_uuid(),
  helper_id       uuid,
  helper_name     text,
  lead_tech_id    uuid,
  lead_tech_name  text,
  started_at      timestamptz not null default now(),  -- pairing window start
  ended_at        timestamptz,
  lat             double precision,
  lng             double precision,
  device          text,
  status          text not null default 'pending'
                  check (status in ('pending','active','disputed','ended')),
  accepted_at     timestamptz,
  disputed_at     timestamptz,
  dispute_reason  text,
  created_at      timestamptz not null default now()
);
create index if not exists helper_pairings_lead_idx   on public.helper_pairings (lead_tech_id, status);
create index if not exists helper_pairings_helper_idx on public.helper_pairings (helper_id, status);
alter table public.helper_pairings enable row level security;

-- ── HELPER WASTE — idle tied to a responsible tech. Helper STILL PAID; this is for manager review, not
--    an automatic deduction. Manager assigns the cost; payroll status tracks the outcome. ─────────────
create table if not exists public.helper_waste (
  id              uuid primary key default gen_random_uuid(),
  pairing_id      uuid,
  helper_id       uuid,
  helper_name     text,
  lead_tech_id    uuid,                              -- responsible tech (when tech-caused)
  lead_tech_name  text,
  job_id          uuid,
  reason          text not null
                  check (reason in ('waiting_on_tech','tech_left','no_job','parts_run','shop_wait','weather','customer_not_ready','lunch','personal')),
  started_at      timestamptz,
  ended_at        timestamptz,
  minutes         int not null default 0,
  -- manager decision: where the idle cost lands. NULL = pending review. Helper is paid regardless.
  manager_decision text check (manager_decision in ('job','shop_overhead','training','tech_strike','payroll_adjustment')),
  decided_by      text,
  decided_at      timestamptz,
  decision_note   text,
  payroll_status  text not null default 'pending' check (payroll_status in ('pending','applied','waived')),
  created_at      timestamptz not null default now()
);
create index if not exists helper_waste_review_idx on public.helper_waste (manager_decision, payroll_status);
create index if not exists helper_waste_tech_idx   on public.helper_waste (lead_tech_id);
alter table public.helper_waste enable row level security;

-- Pending tables paste — run once in Supabase SQL Editor. Idempotent.
-- PREREQUISITE: assumes migrations 13-26 already ran (esp. 23_job_photo_spine = job_photos), which 29_receipts FKs.

-- ===== 12_ar_activity.sql =====
-- AR activity ledger — the "accounting bot keeping track". Every mark-paid (and later: payments,
-- statements sent, dunning) is recorded here: who did what, to whom, for how much, when. This is the
-- audit trail the books bot watches + reports on. Idempotent. Run in the Supabase SQL editor.

create table if not exists public.ar_activity (
  id             uuid primary key default gen_random_uuid(),
  action         text not null,          -- 'invoice_paid' | 'customer_paid'
  customer_id    uuid,
  customer_name  text,
  invoice_id     uuid,
  invoice_number text,
  amount         numeric,
  by_email       text,                   -- stamped server-side
  created_at     timestamptz not null default now()
);
create index if not exists ar_activity_created on public.ar_activity (created_at desc);
alter table public.ar_activity enable row level security;

-- ===== 27_tasks.sql =====
-- Office/field task list (Reports & Tasks → Tasks). Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  detail     text,
  assignee   text,                 -- free text name/email for now
  due_date   date,
  priority   text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status     text not null default 'open' check (status in ('open', 'done')),
  created_by text,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index if not exists tasks_open_idx on public.tasks (status, due_date, created_at desc);

-- RLS on, service-role only (the server gates by role).
alter table public.tasks enable row level security;

-- ===== 28_web_leads.sql =====
-- Web Leads inbox (Booking & Intake). Inbound leads from the website / forms land here; the office
-- works them and books the good ones. Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.web_leads (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  phone       text,
  email       text,
  address     text,
  service     text,                 -- what they need
  message     text,                 -- free-text from the form
  source      text not null default 'web',
  status      text not null default 'new' check (status in ('new', 'contacted', 'booked', 'dead')),
  customer_id uuid,                  -- set when matched/created
  job_id      uuid,                  -- set when booked
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists web_leads_status_idx on public.web_leads (status, created_at desc);

-- RLS on, service-role only.
alter table public.web_leads enable row level security;

-- ===== 29_receipts.sql =====
-- Receipt review entries — Accounting works the receipt PHOTOS techs upload on jobs (job_photos
-- where kind='receipt'). One entry per receipt photo: vendor + amount + category + verify/flag.
-- REQUIRES supabase/23_job_photo_spine.sql (job_photos). Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.receipt_entries (
  id              uuid primary key default gen_random_uuid(),
  photo_id        uuid not null unique references public.job_photos(id) on delete cascade,
  job_id          text,
  vendor          text,
  amount_cents    int,
  category        text,             -- materials / fuel / tools / permit / other
  status          text not null default 'pending' check (status in ('pending', 'verified', 'flagged')),
  note            text,
  reviewed_by     uuid,
  reviewed_by_name text,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists receipt_entries_status_idx on public.receipt_entries (status, created_at desc);

-- RLS on, service-role only.
alter table public.receipt_entries enable row level security;

-- ===== 30_proposals.sql =====
-- Accepted estimates (Good/Better/Best price-book proposals) + the follow-up loop. The Estimate
-- builder already inserts here on accept; this table makes it persist and powers Open Estimates.
-- Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.proposals (
  id              text primary key,          -- PB-XXXXXX from the builder
  job_id          text,
  customer        text,
  is_member       boolean,
  tax_rate        numeric,
  status          text not null default 'open',
  recommended_key text,
  selected_key    text,
  accepted_total  numeric,
  tiers           jsonb,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  -- follow-up loop
  contacted_at    timestamptz,
  contact_count   int not null default 0,
  outcome         text check (outcome in ('won', 'lost')),
  outcome_at      timestamptz,
  outcome_by      text
);
create index if not exists proposals_open_idx on public.proposals (outcome, created_at desc);

-- RLS on, service-role only.
alter table public.proposals enable row level security;

-- ===== 31_payroll.sql =====
-- Payroll: per-tech pay config + weekly runs with an APPROVAL GATE. A run is a DRAFT until an
-- approver signs off; nothing here ever sends pay — export to the payroll file is a separate,
-- deliberate step (the no-auto-send rule). CB week = Sun→Sat. Idempotent. Run in the SQL editor.
create extension if not exists pgcrypto;

-- Per-tech pay configuration. Commission techs get commission ONLY (hourly is vacation/holiday pay,
-- never stacked on job pay) — the app enforces that from pay_type.
create table if not exists public.pay_profiles (
  tech_id        uuid primary key references public.techs(id) on delete cascade,
  pay_type       text not null default 'commission' check (pay_type in ('commission', 'hourly', 'hourly_comm', 'salary')),
  commission_pct numeric not null default 0,    -- e.g. 22  (= 22%)
  hourly_rate    numeric not null default 0,
  weekly_salary  numeric not null default 0,
  updated_at     timestamptz not null default now()
);

-- A weekly payroll run (one per Sun→Sat week).
create table if not exists public.cb_payroll_runs (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null unique,
  week_end    date not null,
  status      text not null default 'draft' check (status in ('draft', 'approved')),
  created_by  text,
  created_at  timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz
);

-- Per-tech line in a run. Money in CENTS to avoid float drift. Gross is computed in the app from
-- pay_type so the rule (commission-only vs hourly) is always applied.
create table if not exists public.cb_payroll_lines (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid not null references public.cb_payroll_runs(id) on delete cascade,
  tech_id          uuid,
  tech_name        text,
  pay_type         text,
  jobs_count       int  not null default 0,
  revenue_cents    bigint not null default 0,
  commission_cents bigint not null default 0,   -- computed: commission_pct% of revenue
  hours            numeric not null default 0,   -- manual (web doesn't track hours yet)
  hourly_cents     bigint not null default 0,    -- computed from hours × rate
  bonus_cents      bigint not null default 0,    -- awards (Crown/Turd/HHWP…) — manual
  adjust_cents     bigint not null default 0,    -- approver +/- (callbacks, holds, doc-fraud fee)
  note             text,
  created_at       timestamptz not null default now()
);
create index if not exists cb_payroll_lines_run_idx on public.cb_payroll_lines (run_id);

-- RLS on, service-role only (the server gates by role + the approval flow).
alter table public.pay_profiles enable row level security;
alter table public.cb_payroll_runs enable row level security;
alter table public.cb_payroll_lines enable row level security;

-- ===== 32_doc_fraud.sql =====
-- Doc-fraud cases: claimed materials with no produced/verified receipt → strip the claim + a fee.
-- The fee is applied as a NEGATIVE adjust on a DRAFT payroll line (never a silent deduction; it's
-- reviewed before the run is approved — "pay HELD not deducted"). Idempotent. Run in the SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.doc_fraud_cases (
  id             uuid primary key default gen_random_uuid(),
  tech_id        uuid,
  tech_name      text,
  job_id         text,
  photo_id       uuid,                  -- the flagged receipt this came from (optional)
  claimed_cents  bigint not null default 0,   -- material claim being stripped
  fee_cents      bigint not null default 0,   -- the doc-fraud fee
  reason         text,
  status         text not null default 'open' check (status in ('open', 'applied', 'absolved')),
  created_by     text,
  created_at     timestamptz not null default now(),
  resolved_by    text,
  resolved_at    timestamptz,
  payroll_run_id uuid                    -- set when the fee is applied to a payroll draft
);
create index if not exists doc_fraud_status_idx on public.doc_fraud_cases (status, created_at desc);

-- RLS on, service-role only.
alter table public.doc_fraud_cases enable row level security;

-- ===== 33_cash_custody.sql =====
-- Cash custody chain: track cash a tech collects from collection → turned in to office → deposited.
-- Outstanding (collected, not turned in) = the theft-risk exposure. Idempotent. Run in the SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.cash_custody (
  id            uuid primary key default gen_random_uuid(),
  tech_id       uuid,
  tech_name     text,
  job_id        text,
  customer      text,
  amount_cents  bigint not null default 0,
  status        text not null default 'collected' check (status in ('collected', 'turned_in', 'deposited', 'missing')),
  collected_at  timestamptz not null default now(),
  collected_by  text,
  received_by   text,
  received_at   timestamptz,
  deposit_ref   text,
  deposited_at  timestamptz,
  note          text
);
create index if not exists cash_custody_status_idx on public.cash_custody (status, collected_at desc);

-- RLS on, service-role only.
alter table public.cash_custody enable row level security;

-- ===== 34_goals.sql =====
-- Office goals/targets — the numbers the board's Office Targets gauges + Game Plan missions measure
-- against. Editable on /settings. Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.office_goals (
  key        text primary key,
  label      text not null,
  target     numeric not null default 0,
  unit       text not null default 'count',   -- 'dollars' | 'count'
  assignee   text,
  sort       int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.office_goals (key, label, target, unit, assignee, sort) values
  ('booked_day',     'Booked today',      18000, 'dollars', 'Owner',      1),
  ('avg_ticket',     'Avg ticket',          750, 'dollars', 'Sales',      2),
  ('qa_clear',       'Clear QA holds',        0, 'count',   'Supervisor', 3),
  ('ar_collect_week','Collect AR (week)',  25000, 'dollars', 'Accounting', 4),
  ('calls_day',      'Calls booked',         25, 'count',   'CSRs',       5),
  ('reviews_week',   'New reviews (week)',   10, 'count',   'CSRs',       6),
  ('same_day_fills', 'Same-day fills',        5, 'count',   'Dispatch',   7)
on conflict (key) do nothing;

-- RLS on, service-role only.
alter table public.office_goals enable row level security;

-- ===== 35_memberships.sql =====
-- Memberships — customers enrolled in recurring service plans (the predictable-revenue book).
-- Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid,                                -- optional link to customers (no hard FK — base may differ)
  customer    text not null,                       -- denormalized name for display
  plan        text not null,
  status      text not null default 'active',      -- active | paused | cancelled
  price_cents integer not null default 0,
  period      text not null default 'year',        -- 'month' | 'year' (billing cadence)
  started_on  date not null default current_date,
  renews_on   date,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  text,
  updated_at  timestamptz not null default now()
);
create index if not exists memberships_status_idx on public.memberships (status);
create index if not exists memberships_customer_idx on public.memberships (customer_id);

-- RLS on, service-role only (the app reads/writes through the service key, never the browser).
alter table public.memberships enable row level security;

-- ===== 36_bank_position.sql =====
-- Bank Position — manually-tracked account balances for the owner cash dashboard. The app pairs
-- these with live AR (open invoices) + cash-in-transit (cash_custody) to show the real position.
-- Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.bank_accounts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          text not null default 'checking',  -- checking | savings | cash | credit
  balance_cents bigint not null default 0,          -- credit kind is money OWED (shown separately)
  as_of         date not null default current_date,
  note          text,
  sort          int not null default 0,
  updated_at    timestamptz not null default now(),
  updated_by    text
);
create index if not exists bank_accounts_sort_idx on public.bank_accounts (sort);

-- RLS on, service-role only.
alter table public.bank_accounts enable row level security;

-- ===== 37_reviews.sql =====
-- Reviews — customer reviews log (manual entry now; a feed can write here later). Columns match
-- what the collaborator-audit route already reads (customer_name, rating, text, source, tech_name).
-- Low ratings (≤3) drive Customer Recovery. Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  customer_name text,
  rating        int not null default 5,           -- 1..5
  text          text,
  source        text default 'Google',            -- Google | Facebook | Yelp | Other
  tech_name     text,
  job_id        uuid,
  responded     boolean not null default false,   -- recovery handled (for ≤3 star)
  responded_by  text,
  responded_at  timestamptz,
  created_at    timestamptz not null default now(),
  created_by    text
);
create index if not exists reviews_created_idx on public.reviews (created_at desc);
create index if not exists reviews_rating_idx on public.reviews (rating);

-- RLS on, service-role only.
alter table public.reviews enable row level security;

-- ===== 38_tech_position.sql =====
-- Roster position — who on the techs roster can actually take field jobs. The Job Booking tech
-- picker + the dispatch board rows show everyone EXCEPT 'office'. Editable on /team.
-- Idempotent. Run in the Supabase SQL editor.
alter table public.techs add column if not exists position text not null default 'tech';
-- positions (see lib/positions.js — the app validates writes): field = tech | helper | salesman |
-- field_supervisor | general_manager | owner ; office = dispatcher | office_manager | accounting | office

-- Seed the clearly pure-office staff so they drop off the field picker immediately.
-- NOTE: the owner + supervisors still run calls and keep the tech/iPad view, so they stay
-- field-eligible (default 'tech') — set them to 'supervisor' on /team if you want the label.
-- Only touches rows still at the default — never overrides a position you've set on /team.
update public.techs set position = 'office'
  where position = 'tech' and name in ('Tracey Mills', 'Ashley Payne');

-- ===== 39_booking_fields.sql =====
-- Booking fields — columns the full Job Booking form writes (ported from the live HTML booking).
-- Idempotent, additive. Run in the Supabase SQL editor.
alter table public.jobs add column if not exists notes             text;
alter table public.jobs add column if not exists job_class         text;   -- residential | commercial | warranty | insurance
alter table public.jobs add column if not exists arrival_window    text;
alter table public.jobs add column if not exists po_number         text;
alter table public.jobs add column if not exists claim_number      text;
alter table public.jobs add column if not exists warranty_provider text;
alter table public.jobs add column if not exists how_heard         text;
alter table public.jobs add column if not exists referral_code     text;
alter table public.jobs add column if not exists state             text;
alter table public.jobs add column if not exists zip               text;

-- Consent captured at booking (we never auto-send — this records permission + when/where).
alter table public.customers add column if not exists marketing_consent boolean;
-- (customers.email, sms_consent, consent_source, consent_ts already exist.)

-- ===== 40_triage.sql =====
-- Triage — structured intake answers (water-heater fuel/size, leak/shutoff, decoded unit, etc.)
-- captured at booking, stored on the job. Idempotent, additive. Run in the Supabase SQL editor.
alter table public.jobs add column if not exists triage jsonb;

-- ===== 41_comms.sql =====
-- Customer comms log — every text/email we send (booking confirmations, ETA, reminders). Audit
-- trail for the no-auto-send rule: who sent what, to whom, when, and the provider result.
-- Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.cb_comms (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null default 'sms',     -- sms | email
  direction   text not null default 'out',
  to_addr     text,
  customer_id uuid,
  job_id      uuid,
  body        text,
  status      text not null default 'sent',     -- sent | failed | queued
  provider_id text,
  error       text,
  sent_by     text,
  created_at  timestamptz not null default now()
);
create index if not exists cb_comms_created_idx on public.cb_comms (created_at desc);
create index if not exists cb_comms_customer_idx on public.cb_comms (customer_id);

alter table public.cb_comms enable row level security;

-- ===== 42_search_customers.sql =====
-- Customer search that matches phones regardless of formatting. Phones are stored like
-- "(859) 779-8824"; typing "8597798824" must still find them. Strips non-digits from BOTH the
-- stored phone and the search term. Idempotent. Run in the Supabase SQL editor.
create or replace function public.search_customers(term text)
returns table (
  id uuid, name text, phone text, address text,
  cb_number bigint, lifetime_revenue numeric, lifetime_jobs integer,
  last_job_completed date, do_not_service boolean
)
language sql stable as $$
  select c.id, c.name, c.phone, c.address,
         c.cb_number::bigint, c.lifetime_revenue::numeric, c.lifetime_jobs::integer,
         c.last_job_completed::date, c.do_not_service::boolean
  from public.customers c
  where c.name ilike '%' || term || '%'
     or (
       length(regexp_replace(coalesce(term, ''), '\D', '', 'g')) >= 4
       and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')
           ilike '%' || regexp_replace(term, '\D', '', 'g') || '%'
     )
  order by c.lifetime_revenue desc nulls last
  limit 15;
$$;

-- ===== 43_tech_phone.sql =====
-- Tech phone — so the office can text the assigned tech (e.g. the dispatch.me "On My Way" link on
-- warranty jobs). Set on /team. Idempotent, additive. Run in the Supabase SQL editor.
alter table public.techs add column if not exists phone text;

-- ===== 44_seo_rankings.sql =====
-- SEO rank scans — where Clog Busterz ranks for core plumbing keywords per market (via SerpAPI).
-- Each "Run scan" inserts one row per keyword×location, so history builds for trend. Idempotent.
create extension if not exists pgcrypto;

create table if not exists public.seo_rankings (
  id            uuid primary key default gen_random_uuid(),
  keyword       text not null,
  location      text not null,
  cb_rank       int,                 -- organic position (null = not found in top results)
  cb_in_local   boolean default false,  -- present in the Google local/map pack
  top_results   jsonb,               -- [{rank,title,domain}] organic competitors above/around us
  local_results jsonb,               -- [{name,rating}] local-pack competitors
  scanned_at    timestamptz not null default now(),
  scanned_by    text
);
create index if not exists seo_rankings_scan_idx on public.seo_rankings (scanned_at desc);
create index if not exists seo_rankings_kw_idx on public.seo_rankings (keyword, location, scanned_at desc);

alter table public.seo_rankings enable row level security;

-- ===== 45_competitor_pricing.sql =====
-- Competitor pricing radar — price points mined from competitor Google reviews (e.g. "$3400 water
-- heater install, 5★"), so CB can see where it sits vs the market. Idempotent.
create extension if not exists pgcrypto;

create table if not exists public.competitor_pricing (
  id          uuid primary key default gen_random_uuid(),
  competitor  text not null,
  service     text,
  price_cents bigint,
  rating      numeric,
  quote       text,
  location    text,
  source      text default 'google_review',
  scanned_at  timestamptz not null default now(),
  scanned_by  text
);
create index if not exists competitor_pricing_scan_idx on public.competitor_pricing (scanned_at desc);
create index if not exists competitor_pricing_comp_idx on public.competitor_pricing (competitor);

alter table public.competitor_pricing enable row level security;

-- ===== 46_shop_issues.sql =====
-- Shop Counter — parts/materials issued to a JOB# (cost hits the job, NOT tech pay), plus returns
-- and rentals. Ported from the live HTML shop sheet. Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.shop_issues (
  id                uuid primary key default gen_random_uuid(),
  job_id            text,                              -- the JOB# the cost lands on
  customer          text,
  item_name         text not null,
  sku               text,
  qty               numeric not null default 1,
  unit              text default 'ea',
  unit_cost_cents   bigint not null default 0,
  total_cost_cents  bigint not null default 0,         -- qty × unit_cost (computed in the app)
  kind              text not null default 'issue',     -- issue | rental
  rental_daily_cents bigint,                           -- rentals: daily rate
  rental_days       int,
  status            text not null default 'out',       -- out | returned
  issued_to         text,                              -- tech who took it (optional)
  note              text,
  issued_by         text,
  created_at        timestamptz not null default now(),
  returned_at       timestamptz,
  returned_by       text
);
create index if not exists shop_issues_job_idx on public.shop_issues (job_id);
create index if not exists shop_issues_created_idx on public.shop_issues (created_at desc);
create index if not exists shop_issues_status_idx on public.shop_issues (status);

alter table public.shop_issues enable row level security;

-- ===== 47_vendors_pos.sql =====
-- Vendors, vendor price book, and purchase orders for the Shop module. Idempotent. Run in SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.vendors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  account_no text,
  rep        text,
  phone      text,
  email      text,
  terms      text,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists vendors_name_idx on public.vendors (name);

-- What we pay a vendor for a part (the price book the Bulk-Buy Finder compares against).
create table if not exists public.vendor_prices (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid,
  vendor_name text,
  item        text not null,
  sku         text,
  price_cents bigint not null default 0,
  unit        text default 'ea',
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists vendor_prices_vendor_idx on public.vendor_prices (vendor_id);
create index if not exists vendor_prices_item_idx on public.vendor_prices (item);

create table if not exists public.purchase_orders (
  id          uuid primary key default gen_random_uuid(),
  po_number   text,
  vendor_id   uuid,
  vendor_name text,
  status      text not null default 'draft',   -- draft | ordered | received
  total_cents bigint not null default 0,
  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  ordered_at  timestamptz,
  received_at timestamptz
);
create index if not exists purchase_orders_status_idx on public.purchase_orders (status, created_at desc);

create table if not exists public.po_lines (
  id              uuid primary key default gen_random_uuid(),
  po_id           uuid not null references public.purchase_orders(id) on delete cascade,
  item            text not null,
  sku             text,
  qty             numeric not null default 1,
  unit_cost_cents bigint not null default 0,
  line_total_cents bigint not null default 0
);
create index if not exists po_lines_po_idx on public.po_lines (po_id);

alter table public.vendors enable row level security;
alter table public.vendor_prices enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.po_lines enable row level security;

-- ===== 48_inventory_counts.sql =====
-- Parts Reconciliation — physical counts vs system qty, so shrink/variance shows up. Idempotent.
create extension if not exists pgcrypto;

create table if not exists public.inventory_counts (
  id          uuid primary key default gen_random_uuid(),
  item        text not null,
  sku         text,
  location    text,                    -- van/tech or shop bin
  system_qty  numeric not null default 0,
  counted_qty numeric not null default 0,
  variance    numeric not null default 0,   -- counted - system (negative = shrink)
  note        text,
  counted_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists inventory_counts_created_idx on public.inventory_counts (created_at desc);

alter table public.inventory_counts enable row level security;

-- ===== 49_shop_stock.sql =====
-- Shop (warehouse) stock with bin locations — powers Slotting & Putaway (assign bins) + Stock Map
-- (see what's in each bin). Distinct from per-van truck_inventory. Idempotent. Run in SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.shop_stock (
  id         uuid primary key default gen_random_uuid(),
  item       text not null,
  sku        text,
  qty        numeric not null default 0,
  bin        text,                       -- shop location (e.g. A-3, RACK 2)
  min_qty    numeric,
  note       text,
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists shop_stock_bin_idx on public.shop_stock (bin);
create index if not exists shop_stock_item_idx on public.shop_stock (item);

alter table public.shop_stock enable row level security;

-- ===== 50_proposals_followup.sql =====
-- Backfill proposals follow-up columns. 22_proposals.sql created the table first, so 30_proposals.sql's
-- `create table if not exists` was a no-op and these never got added on existing DBs. Idempotent.
alter table public.proposals add column if not exists contacted_at  timestamptz;
alter table public.proposals add column if not exists contact_count int not null default 0;
alter table public.proposals add column if not exists outcome       text;
alter table public.proposals add column if not exists outcome_at    timestamptz;
alter table public.proposals add column if not exists outcome_by    text;

-- ===== 51_reviews_links.sql =====
-- Tie reviews to the customer/tech records + add recovery ownership and request status. Idempotent.
alter table public.reviews add column if not exists customer_id    uuid;
alter table public.reviews add column if not exists tech_id        uuid;
alter table public.reviews add column if not exists recovery_owner text;
alter table public.reviews add column if not exists request_status text default 'none';  -- none | requested | received
create index if not exists reviews_customer_idx on public.reviews (customer_id);
create index if not exists reviews_tech_idx on public.reviews (tech_id);

-- ===== 52_membership_fields.sql =====
-- Memberships → real recurring revenue: billing status, benefits, discount, next service due.
-- Idempotent, additive. Run in the Supabase SQL editor.
alter table public.memberships add column if not exists billing_status   text default 'current';  -- current | past_due | comp
alter table public.memberships add column if not exists benefits         text;
alter table public.memberships add column if not exists discount_pct     numeric;
alter table public.memberships add column if not exists next_service_due date;

-- ===== 53_job_handoff.sql =====
-- Dispatch handoff context — the "what the tech needs to know" fields captured at booking and shown
-- on the board/job panel. Idempotent, additive. Run in the Supabase SQL editor.
alter table public.jobs add column if not exists customer_promise text;   -- what we promised the customer
alter table public.jobs add column if not exists access_notes     text;   -- gate code, dog, parking, lockbox
alter table public.jobs add column if not exists sold_scope       text;   -- what was sold / scope of work
alter table public.jobs add column if not exists must_tell_tech   text;   -- 🚨 critical heads-up for the tech
alter table public.jobs add column if not exists csr              text;   -- who booked it

-- ===== 54_customer_interactions.sql =====
-- CRM spine: every touch with a customer — calls, notes, follow-ups, complaints, promises — optionally
-- linked to a job/invoice/estimate/review/lead. Replaces free-text tasks with owned, due-dated
-- follow-ups tied to a customer. Idempotent. Run in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.customer_interactions (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid,
  customer_name text,
  kind          text not null default 'note',   -- call | note | followup | sms | email | visit | complaint | promise
  summary       text,
  link_type     text,                            -- job | invoice | estimate | review | lead
  link_id       text,
  due_date      date,                            -- set → it's an open follow-up
  status        text not null default 'done',    -- followups start 'open'; logged touches are 'done'
  owner         text,
  created_by    text,
  created_at    timestamptz not null default now(),
  done_at       timestamptz
);
create index if not exists cust_inter_customer_idx on public.customer_interactions (customer_id, created_at desc);
create index if not exists cust_inter_followup_idx on public.customer_interactions (status, due_date);

alter table public.customer_interactions enable row level security;

-- ===== 55_job_closeout.sql =====
-- Closeout v2 — the disposition checklist beyond photos/QA: payment, signature, invoice/receipt,
-- review request, cash custody, warranty packet. One row per job. Idempotent. Run in the SQL editor.
create extension if not exists pgcrypto;

create table if not exists public.job_closeout (
  job_id              uuid primary key,
  payment_disposition text,                 -- paid_card | paid_cash | check | invoiced | warranty | cod | no_charge
  signed              boolean not null default false,
  signed_by           text,
  invoice_status      text,                 -- none | sent | receipt_given
  review_requested    boolean not null default false,
  cash_status         text,                 -- n/a | pending | turned_in
  warranty_packet     boolean not null default false,
  note                text,
  closed_at           timestamptz,
  closed_by           text,
  updated_by          text,
  updated_at          timestamptz not null default now()
);

alter table public.job_closeout enable row level security;


-- ===== 56_comms_discord_readback.sql =====
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

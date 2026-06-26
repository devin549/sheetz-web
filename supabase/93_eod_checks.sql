-- End of Day gate (HTML eod pane) — reuses the same per-tech/day sod_checks row. Tools check-IN compares
-- to the morning check-out; van end-of-shift pairs with the morning pre-trip; cash custody per §21.
-- Additive, idempotent.
alter table public.sod_checks add column if not exists tools_checked_in boolean not null default false;
alter table public.sod_checks add column if not exists end_odometer     int;
alter table public.sod_checks add column if not exists end_gas          text;
alter table public.sod_checks add column if not exists cash_in_hand_cents bigint;
alter table public.sod_checks add column if not exists cash_custody     text;   -- dropped | hold
alter table public.sod_checks add column if not exists eod_done         boolean not null default false;
alter table public.sod_checks add column if not exists eod_done_at      timestamptz;

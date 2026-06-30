-- 151 — Owner-editable margin target. The operational coaching/enforcement target was a hardcoded 59% in
-- code (lib/marginCoach MARGIN_TARGET); this makes it a config value Devin can tune without a redeploy. The
-- low-margin scanner reads it (falls back to the 59 code default if the column/row is absent). NOTE: this is
-- the OPERATIONAL target — separate from the 55% Corn-Crown/race award thresholds, which stay as-is. Idempotent.
alter table public.pricing_settings
  add column if not exists margin_target_pct numeric not null default 59;

comment on column public.pricing_settings.margin_target_pct is 'Operational margin target % (low-margin flagging). Owner-editable. Separate from the 55% award thresholds.';

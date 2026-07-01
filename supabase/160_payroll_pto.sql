-- 160 — Absences P3: surface holiday pay + salary docking as their own transparent line items on a payroll
-- run (so the approver SEES them and can edit, never a silent change baked into 'adjust'). Positive magnitudes;
-- gross = commission + base + bonus + holiday − dock + adjust.
alter table public.cb_payroll_lines add column if not exists holiday_cents integer not null default 0;  -- +8h×hourly per earned holiday (techs only)
alter table public.cb_payroll_lines add column if not exists dock_cents    integer not null default 0;  -- salary: unpaid days docked in 4-hr blocks (incl. proration shortfall)
alter table public.cb_payroll_lines add column if not exists pto_note      text;                        -- human-readable "+1 holiday · −1 unpaid day"

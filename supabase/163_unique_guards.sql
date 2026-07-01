-- 163 — data-integrity guards (audit P2-10, P2-11). Without these, a retry or double-click can write two
-- payroll lines for one tech in a run (double pay), and a duplicate absence row can double-count toward the
-- 2-strike holiday forfeiture. RLS/app code is currently the ONLY guard on these invariants — make the DB enforce them.
--
-- NOTE: if either CREATE fails with "could not create unique index ... duplicate key", there are already
-- duplicate rows in prod. De-dupe first (keep the newest), then re-run. Finder queries:
--   select run_id, tech_id, count(*) from cb_payroll_lines group by 1,2 having count(*) > 1;
--   select user_id, absence_date, count(*) from absences group by 1,2 having count(*) > 1;
create unique index if not exists cb_payroll_lines_run_tech_uidx on public.cb_payroll_lines (run_id, tech_id);
create unique index if not exists absences_user_date_uidx        on public.absences (user_id, absence_date);

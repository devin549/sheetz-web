-- 163 — data-integrity guards (audit P2-10, P2-11). Without these, a retry or double-click can write two
-- payroll lines for one tech in a run (double pay), and a duplicate absence row can double-count toward the
-- 2-strike holiday forfeiture. RLS/app code is currently the ONLY guard on these invariants — make the DB enforce them.
--
-- Self-healing: de-dupe FIRST (keeping the most authoritative row per key), so the indexes always create
-- cleanly. Absences: a decided/overridden row wins over the original, else the newest. Payroll lines: the
-- newest line per (run_id, tech_id). These removals ARE the double-count the indexes prevent going forward.
with ranked as (
  select id, row_number() over (partition by user_id, absence_date
           order by decided_at desc nulls last, created_at desc, id desc) as rn
  from public.absences
)
delete from public.absences a using ranked r where a.id = r.id and r.rn > 1;

with ranked as (
  select id, row_number() over (partition by run_id, tech_id order by id desc) as rn
  from public.cb_payroll_lines
)
delete from public.cb_payroll_lines a using ranked r where a.id = r.id and r.rn > 1;

create unique index if not exists cb_payroll_lines_run_tech_uidx on public.cb_payroll_lines (run_id, tech_id);
create unique index if not exists absences_user_date_uidx        on public.absences (user_id, absence_date);

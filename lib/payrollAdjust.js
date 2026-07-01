// lib/payrollAdjust.js — Absences P3: the salary/holiday money rules, as PURE functions so payroll math is
// testable and the approver stays in control (nothing here sends pay; it produces SUGGESTED line adjustments
// the approver sees and can edit).
//
// CB rules (Devin, 2026-06):
//   • Salary/supervisor: a paid holiday is NOT extra money — their weekly check already covers it. Holiday pay
//     only applies to TECHS (commission/hourly): 8 hrs at their hourly rate PER earned holiday, ON TOP of the
//     commission they earn if they actually work that day.
//   • 2+ unexcused absences in the year → all 5 holidays forfeited (no holiday pay).
//   • Salary docking: unpaid days (approved UNPAID time-off, or an unexcused no-show) dock the weekly salary,
//     in 4-hour blocks. Vacation/personal within balance is paid and never docks.
//   • Proration: a salary that starts (or ends) mid-week is pro-rated to the workdays actually worked (of 5).
//
// All amounts are integer CENTS. Dock/holiday are returned as POSITIVE magnitudes; the caller adds holiday and
// SUBTRACTS the dock.
import { holidayEarned, holidaysForfeited } from '@/lib/pto';

export const HOURS_PER_DAY = 8;
export const WORKDAYS_PER_WEEK = 5;
export const DOCK_BLOCK_HOURS = 4; // salary is docked in half-day (4-hr) blocks, rounded up

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// A salary's implied hourly value (weekly salary ÷ 40). Cents in → cents/hr out (may be fractional).
export function salaryHourlyCents(weeklySalaryCents) { return num(weeklySalaryCents) / (WORKDAYS_PER_WEEK * HOURS_PER_DAY); }

// Dock unpaid salary hours, rounded UP to the next 4-hr block. Returns positive cents to subtract.
export function salaryDockCents(weeklySalaryCents, unpaidHours) {
  const w = num(weeklySalaryCents), u = num(unpaidHours);
  if (w <= 0 || u <= 0) return 0;
  const blocks = Math.ceil(u / DOCK_BLOCK_HOURS);
  return Math.round(blocks * DOCK_BLOCK_HOURS * salaryHourlyCents(w));
}

// Pro-rate a weekly salary to the workdays actually worked (of 5). daysWorked ≥ 5 → full salary.
export function prorateSalaryCents(weeklySalaryCents, daysWorked) {
  const w = num(weeklySalaryCents);
  const d = Math.max(0, Math.min(WORKDAYS_PER_WEEK, num(daysWorked)));
  if (d >= WORKDAYS_PER_WEEK) return w;
  return Math.round(w * d / WORKDAYS_PER_WEEK);
}

// Holiday pay for a TECH: 8 hrs × hourly rate per EARNED holiday. Salary or forfeited → 0.
export function holidayPayCents({ isSalary, hourlyRateDollars, holidaysEarned = 0, forfeited = false } = {}) {
  if (isSalary || forfeited) return 0;
  const n = Math.max(0, num(holidaysEarned)), r = num(hourlyRateDollars);
  if (n <= 0 || r <= 0) return 0;
  return Math.round(n * HOURS_PER_DAY * r * 100);
}

// How many of this week's holidays a person actually EARNED. Forfeited (2+ unexcused YTD) → 0. Otherwise a
// holiday is earned unless they were UNEXCUSED-absent on either guard day (work-before-and-after rule).
//   holidayDates          — 'YYYY-MM-DD'[] holidays that fall in this pay week
//   unexcusedDatesYTD      — 'YYYY-MM-DD'[] all unexcused absences this calendar year (for the forfeit count)
//   unexcusedDatesAround   — 'YYYY-MM-DD'[] unexcused absences on/near the guard days (usually same as YTD set)
export function earnedHolidays(holidayDates = [], unexcusedDatesYTD = [], unexcusedDatesAround = null) {
  if (holidaysForfeited(unexcusedDatesYTD.length)) return { earned: 0, forfeited: true, holidays: [] };
  const absent = unexcusedDatesAround || unexcusedDatesYTD;
  const kept = (holidayDates || []).filter((h) => holidayEarned(h, absent).eligible);
  return { earned: kept.length, forfeited: false, holidays: kept };
}

// Orchestrator: given one person's already-fetched week context, return the P3 line adjustments.
//   ctx = { isSalary, weeklySalaryCents, hourlyRateDollars, unpaidDays, holidayDates, unexcusedDatesYTD,
//           prorationDaysWorked (null = full week) }
// Returns { holidayCents, dockCents, prorationCents, holidaysEarned, forfeited, notes[] }.
export function computeP3(ctx = {}) {
  const notes = [];
  const { isSalary, weeklySalaryCents, hourlyRateDollars, unpaidDays = 0, holidayDates = [], unexcusedDatesYTD = [], prorationDaysWorked = null } = ctx;

  const { earned, forfeited } = earnedHolidays(holidayDates, unexcusedDatesYTD);
  const holidayCents = holidayPayCents({ isSalary, hourlyRateDollars, holidaysEarned: earned, forfeited });
  if (holidayCents > 0) notes.push(`+${earned} holiday${earned > 1 ? 's' : ''} × 8h`);
  else if (forfeited && holidayDates.length) notes.push('holiday forfeited (2+ unexcused)');

  let dockCents = 0;
  if (isSalary && unpaidDays > 0) { dockCents = salaryDockCents(weeklySalaryCents, unpaidDays * HOURS_PER_DAY); if (dockCents > 0) notes.push(`−${unpaidDays} unpaid day${unpaidDays > 1 ? 's' : ''}`); }

  let prorationCents = 0;
  if (isSalary && prorationDaysWorked != null && prorationDaysWorked < WORKDAYS_PER_WEEK) {
    const full = num(weeklySalaryCents);
    prorationCents = prorateSalaryCents(weeklySalaryCents, prorationDaysWorked) - full; // negative
    if (prorationCents < 0) notes.push(`pro-rated to ${prorationDaysWorked}/5 days`);
  }

  return { holidayCents, dockCents, prorationCents, holidaysEarned: earned, forfeited, notes };
}

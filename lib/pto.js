// lib/pto.js — the REAL vacation/PTO engine. Replaces the hardcoded '40 hrs' that used to sit on /pto.
//
// CB benefit (Devin, 2026-06):
//   • Each employee earns 5 vacation days (40 hrs) on their HIRE ANNIVERSARY — use-it-or-lose-it (resets each
//     anniversary, NO carryover). A new hire earns nothing until their 1-year mark.
//   • Paid holidays (5/yr) start after 90 days on the job.
//   • 2 unexcused absences in a year forfeit all 5 holidays.
//   • Salary / supervisors: a sick or personal day PULLS from vacation first, then a pro-rated dock.
//
// Everything is computed from data we already store (pay_profiles.hire_date, time_off_requests, absences) —
// no separate balance table to drift out of sync. hire_date is the one new input the office fills in.

const DAY_MS = 86400000;
const HOURS_PER_DAY = 8;
export const VACATION_DAYS = 5;
export const VACATION_HOURS = VACATION_DAYS * HOURS_PER_DAY; // 40
export const HOLIDAY_DAYS = 5;
export const HOLIDAY_ELIGIBLE_DAYS = 90;
export const UNEXCUSED_FORFEIT = 2;
export const BEREAVEMENT_IMMEDIATE_DAYS = 3; // immediate family — paid
export const BEREAVEMENT_EXTENDED_DAYS = 1;  // extended / close — paid

function asDate(v) {
  if (!v) return null;
  const d = new Date(typeof v === 'string' && v.length === 10 ? v + 'T12:00:00' : v);
  return isNaN(d.getTime()) ? null : d;
}

// The most recent hire-anniversary on or before `now`. null hire_date → null.
export function lastAnniversary(hireDate, now = new Date()) {
  const h = asDate(hireDate);
  if (!h) return null;
  const a = new Date(now.getFullYear(), h.getMonth(), h.getDate(), 0, 0, 0, 0);
  if (a > now) a.setFullYear(a.getFullYear() - 1);
  return a;
}

export function daysSinceHire(hireDate, now = new Date()) {
  const h = asDate(hireDate);
  if (!h) return null;
  return Math.floor((now - h) / DAY_MS);
}

// Inclusive day count for a [start,end] range, clipped so anything before `floor` (the anniversary) doesn't count.
function rangeDays(start, end, floor) {
  const s = asDate(start);
  if (!s) return 0;
  const e = asDate(end) || s;
  const from = floor && s < floor ? floor : s;
  if (e < from) return 0;
  return Math.floor((e - from) / DAY_MS) + 1;
}

// The real vacation picture for one person.
//   hireDate          — pay_profiles.hire_date (null → "not set"; banner nudges the office to fill it in)
//   timeOff           — their time_off_requests rows [{ kind, start_date, end_date, status }]
//   vacationPullDays  — # of salary sick/personal days already charged to vacation since the anniversary
export function vacationStatus({ hireDate, timeOff = [], vacationPullDays = 0 } = {}, now = new Date()) {
  const since = daysSinceHire(hireDate, now);
  const earned = since != null && since >= 365;       // 40h lands only after the 1-yr mark
  const grantHours = earned ? VACATION_HOURS : 0;
  const anniv = lastAnniversary(hireDate, now);
  let usedDays = 0;
  for (const r of timeOff || []) {
    if (String(r.status) !== 'approved') continue;
    if (!['vacation', 'personal'].includes(r.kind)) continue;
    usedDays += rangeDays(r.start_date, r.end_date, anniv);
  }
  usedDays += Math.max(0, Number(vacationPullDays) || 0);
  const usedHours = usedDays * HOURS_PER_DAY;
  return {
    hasHireDate: since != null,
    daysSinceHire: since,
    earned,
    grantHours,
    usedHours,
    balanceHours: Math.max(0, grantHours - usedHours),
    overdrawnHours: Math.max(0, usedHours - grantHours), // used past the allotment → pro-rated dock territory
    holidaysEligible: since != null && since >= HOLIDAY_ELIGIBLE_DAYS,
    daysToHolidayEligible: since != null && since < HOLIDAY_ELIGIBLE_DAYS ? HOLIDAY_ELIGIBLE_DAYS - since : 0,
    anniversary: anniv ? anniv.toISOString().slice(0, 10) : null,
  };
}

// Bereavement paid-day allotment by relation. immediate = 3, extended = 1 (per occurrence).
export function bereavementPaidDays(relation) {
  return relation === 'extended' ? BEREAVEMENT_EXTENDED_DAYS : BEREAVEMENT_IMMEDIATE_DAYS;
}

// Are this year's 5 paid holidays forfeited? (2+ unexcused absences in the year.)
export function holidaysForfeited(unexcusedCount) {
  return (Number(unexcusedCount) || 0) >= UNEXCUSED_FORFEIT;
}

const hrs = (h) => `${Math.round((h + Number.EPSILON) * 10) / 10} hrs`;
export const fmtHours = hrs;

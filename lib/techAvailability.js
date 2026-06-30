// Shared dispatch availability backbone — "who's off the schedule" on a given date. Two sources:
//   • absences.absence_date            — a tech reported out that day (sick / jury / bereavement / etc.)
//   • approved time_off_requests        — planned vacation / personal / unpaid covering the date
// Both block scheduling. A same-day SICK absence also pulls the tech's existing jobs to the holding tray
// (see pto/actions reportAbsence). user_id → tech_id is resolved via profiles.tech_id.
//
// Pure helpers (noticeDays / rangesOverlap / conflictsWith) are import-safe in client components. The async
// query helpers take an admin `sb` so this file pulls in no server-only deps.

const DAY = 86400000;
export const SHORT_NOTICE_DAYS = 14; // CB prefers ≥2 weeks notice for planned time off

const d10 = (s) => (s == null ? null : String(s).slice(0, 10));

// Whole days from today until a start date (negative = in the past). null if unparseable.
export function noticeDays(startDate, now = new Date()) {
  const s10 = d10(startDate);
  if (!s10) return null;
  const s = new Date(s10 + 'T12:00:00');
  if (isNaN(s.getTime())) return null;
  const t = new Date(now); t.setHours(12, 0, 0, 0);
  return Math.round((s - t) / DAY);
}

// Do two inclusive date ranges overlap? A null end = single-day range (end = start).
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  const as = d10(aStart), ae = d10(aEnd) || d10(aStart), bs = d10(bStart), be = d10(bEnd) || d10(bStart);
  if (!as || !bs) return false;
  return as <= be && bs <= ae;
}

// From an already-loaded list of approved time-off rows, the ones for OTHER people that overlap [start,end].
// Powers the manager's "are you sure — these people are already off then" confirm.
export function conflictsWith(approvedList = [], start, end, excludeUserId) {
  return (approvedList || []).filter((r) => r.user_id !== excludeUserId && rangesOverlap(start, end, r.start_date, r.end_date));
}

// Tech IDs unavailable ON a date (absences that day + approved time-off covering it). Needs an admin sb.
export async function unavailableTechIdsOn(sb, dateStr) {
  const out = new Set();
  const date = d10(dateStr);
  if (!sb || !date) return out;
  try {
    const userIds = new Set();
    const { data: abs } = await sb.from('absences').select('user_id').eq('absence_date', date);
    (abs || []).forEach((a) => a.user_id && userIds.add(a.user_id));
    const { data: to } = await sb.from('time_off_requests').select('user_id, start_date, end_date').eq('status', 'approved').lte('start_date', date);
    (to || []).forEach((r) => { if ((d10(r.end_date) || d10(r.start_date)) >= date) r.user_id && userIds.add(r.user_id); });
    if (userIds.size) {
      const { data: profs } = await sb.from('profiles').select('user_id, tech_id, name').in('user_id', [...userIds]);
      (profs || []).forEach((p) => p.tech_id && out.add(p.tech_id));
    }
  } catch (_) {}
  return out;
}

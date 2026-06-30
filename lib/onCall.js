// On-call helpers shared by the /on-call page and the 4:30pm cron.
import { googleCalendarLink } from '@/lib/calendar';

export const DAYS = [
  { field: 'mon', label: 'Monday' },
  { field: 'tue', label: 'Tuesday' },
  { field: 'wed', label: 'Wednesday' },
  { field: 'thu', label: 'Thursday' },
  { field: 'weekend', label: 'Weekend (Fri 5pm → Mon)' },
];
const DAY_FIELD = { Monday: 'mon', Tuesday: 'tue', Wednesday: 'wed', Thursday: 'thu', Friday: 'weekend', Saturday: 'weekend', Sunday: 'weekend' };

export function etWeekday(date = new Date()) {
  return date.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' });
}

// Who's on tonight, given the schedule + a weekday name. { person, field, weekday } or null.
export function onCallFor(schedule, weekday) {
  if (!schedule) return null;
  const field = DAY_FIELD[weekday];
  if (!field) return null;
  return { person: schedule[field] || '', field, weekday };
}

// The nightly #sheetz message for a given weekday (cron posts Mon–Fri; Fri names the weekend). Breaks out
// all THREE roles for the night: the on-call tech + the week's helper + the week's supervisor.
export function announceText(schedule, weekday) {
  if (!schedule) return null;
  const oc = onCallFor(schedule, weekday);
  if (!oc || !oc.person) return null;
  const helper = schedule.helper_week ? ` · 🔧 ${schedule.helper_week} (helper)` : '';
  const sup = schedule.supervisor ? ` · 👷 ${schedule.supervisor} (supervisor)` : '';
  if (weekday === 'Friday') {
    return `☎️ **Weekend on-call** (Fri 5pm → Mon 7am)\n📞 ${oc.person} (tech)${helper}${sup}\nAfter-hours calls go to ${oc.person}. Have a good weekend! 🍻`;
  }
  return `☎️ **On-call tonight** — ${weekday} (5pm → 7am)\n📞 ${oc.person} (tech)${helper}${sup}\nAfter-hours calls go to ${oc.person}.`;
}

// The full-week breakdown (posted when the office sets the week) — every night laid out, plus the week's
// helper + supervisor. Mirrors the manual post the office used to type by hand. Returns null if nothing's set.
export function weeklyText(schedule) {
  if (!schedule) return null;
  const day = (label, v) => `${label.padEnd(4)} — ${clean(v) || '—'}`;
  const anySet = ['mon', 'tue', 'wed', 'thu', 'weekend'].some((k) => clean(schedule[k]));
  if (!anySet) return null;
  return [
    `📅 **ON-CALL — this week**${clean(schedule.week_label) ? ` (${clean(schedule.week_label)})` : ''}`,
    day('Mon', schedule.mon),
    day('Tue', schedule.tue),
    day('Wed', schedule.wed),
    day('Thu', schedule.thu),
    `Fri–Sun — ${clean(schedule.weekend) || '—'}`,
    `🔧 Helper: ${clean(schedule.helper_week) || '—'}`,
    `👷 Supervisor: ${clean(schedule.supervisor) || '—'}`,
    `_After-hours calls (5pm → 7am) go to that night's on-call._`,
  ].join('\n');
}
const clean = (v) => String(v == null ? '' : v).trim();

// ── Acknowledge banners (the purple "I'm ready" cards) ───────────────────────────────────────────────
// The on-call windows a person is assigned THIS rotation, for the acknowledge banners + the Cal nav badge.
// Shared so /pto (renders them) and the layout (counts unacknowledged) agree. Stable ids (schedule row/week
// + slot) → an ack persists for this rotation; a new rotation asks again. Returns [{ id, slot, title, window }].
function weekStartKey(now = new Date()) {
  const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

export async function loadOnCallWindows(sb, name) {
  if (!sb || !name) return [];
  try {
    const { data: oc } = await sb.from('on_call_schedule').select('*').eq('slot', 'current').maybeSingle();
    if (!oc) return [];
    const n = String(name).toLowerCase().split(/\s+/)[0];
    if (!n) return [];
    const base = oc.id || oc.updated_at || weekStartKey();
    const has = (k) => String(oc[k] || '').toLowerCase().includes(n);
    // Concrete dates for THIS week so acknowledging hands the tech a real Google Calendar event (with their
    // default reminders). Weekend = Fri 6pm→Mon 7am (61h); week = Mon 5pm→Fri 7am after-hours block (86h).
    const now = new Date(), dow = now.getDay();
    const mon = new Date(now); mon.setHours(0, 0, 0, 0); mon.setDate(now.getDate() - ((dow + 6) % 7));
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
    const weStart = new Date(fri); weStart.setHours(18, 0, 0, 0);
    const wkStart = new Date(mon); wkStart.setHours(17, 0, 0, 0);
    const cal = (title, start, min) => googleCalendarLink({ title: '🚨 ' + title + ' (CB)', startISO: start.toISOString(), durationMin: min, details: 'Clog Busterz after-hours on-call — keep your phone on. You acknowledged this in the app. Office: Tracey / Ronnie.' });
    const out = [];
    if (has('weekend')) out.push({ id: `oc-${base}-weekend`, slot: 'weekend', title: "You're on-call this weekend", window: 'Fri 6:00 PM → Mon 7:00 AM · Primary', startISO: weStart.toISOString(), calLink: cal('On-call this weekend', weStart, 61 * 60) });
    if (['mon', 'tue', 'wed', 'thu'].some(has)) out.push({ id: `oc-${base}-week`, slot: 'week', title: "You're on-call this week", window: 'Weeknights 5:00 PM → 7:00 AM (weekday after-hours) · Primary', startISO: wkStart.toISOString(), calLink: cal('On-call this week (after-hours)', wkStart, 86 * 60) });
    if (has('helper_week')) out.push({ id: `oc-${base}-helper`, slot: 'helper', title: 'Helper on-call this week', window: 'Weeknights · Helper · Primary', startISO: wkStart.toISOString(), calLink: cal('Helper on-call this week', wkStart, 86 * 60) });
    return out;
  } catch (_) { return []; }
}

// How many of those windows the person hasn't acknowledged yet (prefs.oncall_acked holds the acked ids).
export function pendingOnCall(windows = [], acked = []) {
  const done = new Set(Array.isArray(acked) ? acked : []);
  return (windows || []).filter((w) => !done.has(w.id)).length;
}

// Native booking availability — open arrival windows computed from the real dispatch schedule (no overbooking).
// Mon–Sat 8–6 in 2-hour windows, CAPACITY jobs each; Sunday is emergency-only (call the office).
export const CAPACITY = 4;            // fallback per-window capacity if the live tech count is unavailable
export const LEAD_HOURS = 2;          // minimum notice — a window starting sooner than this is not bookable
// BETA: web bookings hold for office approval instead of auto-confirming/assigning. Flip to false once proven.
export const BOOKING_BETA = true;
export const WINDOWS = [
  { label: '8:00–10:00 AM', start: 8 },
  { label: '10:00 AM–12:00 PM', start: 10 },
  { label: '12:00–2:00 PM', start: 12 },
  { label: '2:00–4:00 PM', start: 14 },
  { label: '4:00–6:00 PM', start: 16 },
];
export const windowByLabel = (label) => WINDOWS.find((w) => w.label === label) || null;

// Next `days` days with each window's open/remaining. Capacity = working techs (live), min 2h notice,
// Sunday = emergency-only. From existing non-cancelled jobs.
export async function computeAvailability(sb, days = 14, workingTechs = 0) {
  const cap = workingTechs > 0 ? workingTechs : CAPACITY;
  const leadMs = Date.now() + LEAD_HOURS * 3600000;
  const todayMs = Date.now();
  const startISO = new Date(todayMs).toISOString();
  const endISO = new Date(todayMs + days * 86400000).toISOString();
  let jobs = [];
  try { const { data } = await sb.from('jobs').select('scheduled_at, arrival_window, status').gte('scheduled_at', startISO).lt('scheduled_at', endISO).not('status', 'eq', 'cancelled').limit(5000); jobs = data || []; } catch (_) {}
  const count = {};
  jobs.forEach((j) => { if (!j.scheduled_at) return; const k = String(j.scheduled_at).slice(0, 10) + '|' + (j.arrival_window || ''); count[k] = (count[k] || 0) + 1; });

  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(todayMs + i * 86400000);
    const date = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    if (dow === 0) { out.push({ date, dow, label, emergency: true, windows: [] }); continue; }
    const windows = WINDOWS.map((w) => {
      const n = count[date + '|' + w.label] || 0;
      const startMs = Date.parse(`${date}T${String(w.start).padStart(2, '0')}:00:00Z`);
      const tooSoon = startMs < leadMs;
      return { label: w.label, open: !tooSoon && n < cap, remaining: Math.max(0, cap - n), tooSoon };
    });
    out.push({ date, dow, label, emergency: false, windows });
  }
  return out;
}

// Is a specific date+window still bookable right now? (re-check at submit to avoid a race).
export async function windowOpen(sb, date, windowLabel) {
  if (!windowByLabel(windowLabel)) return false;
  try {
    const { count } = await sb.from('jobs').select('id', { count: 'exact', head: true }).gte('scheduled_at', date + 'T00:00:00').lt('scheduled_at', date + 'T23:59:59').eq('arrival_window', windowLabel).not('status', 'eq', 'cancelled');
    return (count || 0) < CAPACITY;
  } catch { return true; }
}

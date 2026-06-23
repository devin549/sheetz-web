// Design tokens lifted from the live Dispatch Live board (dispatchboard_data.html) — shared by
// the server page (chrome/KPI) and the client grid so both stay in sync.

export const ACCENT = '#FF6B00';
export const STATUS_DOT = {
  scheduled: 'oklch(70% 0.02 240)', enroute: 'oklch(65% 0.14 240)', onsite: 'oklch(62% 0.14 150)',
  hold: 'oklch(72% 0.13 70)', done: 'oklch(55% 0.02 240)', late: 'oklch(68% 0.17 35)',
};
export const PRIORITY = {
  emergency: { short: 'EMG', color: 'oklch(58% 0.20 25)' },
  urgent: { short: 'URG', color: 'oklch(70% 0.16 60)' },
};
export const CREW_COLORS = { 'Drain Team': '#4f9bff', 'Install Crew': '#e0a042', 'HVAC Squad': '#e07a5f' };
export const crewColor = (n) => CREW_COLORS[n] || ACCENT;

// Fixed cancel-reason taxonomy + duration presets — exact from the live board.
export const CANCEL_REASONS = [
  { code: 'CUSTOMER_RESCHEDULED', label: 'Customer rescheduled', needsNote: false },
  { code: 'CUSTOMER_NO_SHOW', label: 'Customer no-show / no access', needsNote: false },
  { code: 'PRICE_TOO_HIGH', label: 'Price too high', needsNote: false },
  { code: 'CHOSE_COMPETITOR', label: 'Went with a competitor', needsNote: true },
  { code: 'FIXED_THEMSELVES', label: 'Issue resolved / no longer needed', needsNote: false },
  { code: 'DUPLICATE', label: 'Duplicate / double-booked', needsNote: false },
  { code: 'WEATHER', label: 'Weather', needsNote: false },
  { code: 'TECH_UNAVAILABLE', label: 'No tech / truck down (our side)', needsNote: false },
  { code: 'PARTS_DELAY', label: 'Parts not in / delayed', needsNote: false },
  { code: 'WRONG_INFO', label: "Bad info — couldn't reach customer", needsNote: false },
  { code: 'NOT_OUR_SERVICE', label: 'Out of our service / scope', needsNote: false },
  { code: 'OTHER', label: 'Other', needsNote: true },
];
export const DURATION_PRESETS = [
  { label: '30m', min: 30 }, { label: '1h', min: 60 }, { label: '1.5h', min: 90 },
  { label: '2h', min: 120 }, { label: '3h', min: 180 }, { label: '4h', min: 240 },
];

export function initials(name) {
  return String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}
export function statusKey(s) {
  s = String(s || '').toLowerCase();
  if (/done|complete|closed/.test(s)) return 'done';
  if (/on_site|onsite/.test(s)) return 'onsite';
  if (/enroute|on_my_way|rolling/.test(s)) return 'enroute';
  if (/hold/.test(s)) return 'hold';
  if (/late/.test(s)) return 'late';
  return 'scheduled';
}
export function priorityOf(p) {
  const s = String(p || '').toLowerCase();
  if (/emergency/.test(s)) return PRIORITY.emergency;
  if (/high|urgent/.test(s)) return PRIORITY.urgent;
  return null;
}
export function hourLabel(h) { const ap = h < 12 ? 'a' : 'p'; const hh = h % 12 === 0 ? 12 : h % 12; return `${hh}${ap}`; }
export function money(n) { const v = Number(n || 0); return v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + Math.round(v); }
export function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } }

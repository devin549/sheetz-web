// P8 helper engine — pairing lifecycle + waste accountability + the report split. Mirrors the old Tech
// Sheet _DB_HelperSplit: the helper's paid time follows the LEAD TECH's job timeline; idle is logged and
// tied to the responsible tech for MANAGER REVIEW — the helper is still PAID, nothing is auto-deducted.
// Pure (pass `now`), money/time in minutes.

export const DISPUTE_WINDOW_MIN = 30; // a pending pairing auto-activates if the lead doesn't dispute within this

// Idle reasons the helper can tap. techCaused = the lead tech is the responsible party (review candidate).
export const WASTE_REASONS = [
  { reason: 'waiting_on_tech',    label: 'Waiting on tech',     icon: '⏳', techCaused: true },
  { reason: 'tech_left',          label: 'Tech left',           icon: '🚗', techCaused: true },
  { reason: 'no_job',             label: 'No job assigned',     icon: '🚫', techCaused: false },
  { reason: 'parts_run',          label: 'Parts run',           icon: '🚐', techCaused: false },
  { reason: 'shop_wait',          label: 'Shop wait',           icon: '🏭', techCaused: false },
  { reason: 'weather',            label: 'Weather',             icon: '🌧', techCaused: false },
  { reason: 'customer_not_ready', label: 'Customer not ready',  icon: '🚪', techCaused: false },
  { reason: 'lunch',              label: 'Lunch',               icon: '🥪', techCaused: false },
  { reason: 'personal',           label: 'Personal',            icon: '🙋', techCaused: false },
];
export const reasonMeta = (r) => WASTE_REASONS.find((x) => x.reason === r) || { reason: r, label: r, icon: '•', techCaused: false };
export const isTechCaused = (r) => !!reasonMeta(r).techCaused;

// Where a manager can land the idle cost. (The helper is paid regardless — this is cost attribution.)
export const MANAGER_DECISIONS = [
  { value: 'job',                label: 'Bill to the job',        icon: '🧾' },
  { value: 'shop_overhead',      label: 'Shop overhead',          icon: '🏭' },
  { value: 'training',           label: 'Training time',          icon: '🎓' },
  { value: 'tech_strike',        label: 'Tech bonus strike',      icon: '⚠️' },
  { value: 'payroll_adjustment', label: 'Approved payroll adj.',  icon: '💵' },
];
export const decisionLabel = (v) => (MANAGER_DECISIONS.find((d) => d.value === v) || {}).label || v;

// Is a pairing in force right now? active explicitly, OR pending past the dispute window with no dispute.
export function pairingActive(p, now) {
  if (!p) return false;
  if (p.status === 'active') return true;
  if (p.status === 'pending' && p.started_at) return (now - Date.parse(p.started_at)) >= DISPUTE_WINDOW_MIN * 60000;
  return false;
}
// Minutes left before a pending pairing auto-activates (for the helper/tech countdown). 0 once active.
export function minsToAutoActivate(p, now) {
  if (!p || p.status !== 'pending' || !p.started_at) return 0;
  return Math.max(0, Math.ceil(DISPUTE_WINDOW_MIN - (now - Date.parse(p.started_at)) / 60000));
}

const wasteMin = (w, now) => (Number.isFinite(w.minutes) && w.minutes ? Math.max(0, w.minutes)
  : (w.started_at ? Math.max(0, Math.round(((w.ended_at ? Date.parse(w.ended_at) : now) - Date.parse(w.started_at)) / 60000)) : 0));

// Day report for one helper: paid / productive / idle, broken out by reason + responsible tech.
// pairedMin = total minutes the helper was paired/on-shift (their PAID time). Idle = sum of waste.
export function helperDaySummary({ waste = [], pairedMin = 0, now = 0 }) {
  let idle = 0; const byReason = {}; const byTech = {};
  waste.forEach((w) => {
    const m = wasteMin(w, now); idle += m;
    byReason[w.reason] = (byReason[w.reason] || 0) + m;
    if (isTechCaused(w.reason) && (w.lead_tech_name || w.lead_tech_id)) {
      const k = w.lead_tech_name || w.lead_tech_id;
      byTech[k] = (byTech[k] || 0) + m;
    }
  });
  const paid = Math.max(idle, Number(pairedMin) || 0);
  const productive = Math.max(0, paid - idle);
  const techCausedIdle = waste.filter((w) => isTechCaused(w.reason)).reduce((s, w) => s + wasteMin(w, now), 0);
  return {
    paidMin: paid, productiveMin: productive, idleMin: idle, techCausedIdleMin: techCausedIdle,
    productivePct: paid > 0 ? Math.round((productive / paid) * 100) : 0,
    byReason, byTech,
  };
}

// Review-queue items = tech-caused waste still awaiting a manager decision.
export const needsReview = (w) => isTechCaused(w.reason) && !w.manager_decision;

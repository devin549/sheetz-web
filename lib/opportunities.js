// The win-back engine's shared source-of-truth. Three streams of money we recommended/quoted but didn't
// capture, all keyed to a customer so the office can follow up:
//   • recommendation     — tech-flagged "Check my notes" AI recs (persisted opportunities rows)
//   • declined_estimate  — an estimate the customer said NO to (live from pricebook_estimates)
//   • aging_water_heater — a 9+ yr unit on file, fuel-correct pitch (live from customer_equipment)
// The board and the campaign audiences both read through here so they can never drift apart.
import { WH_AGE_YEARS } from '@/lib/campaigns';
import { can } from '@/lib/roles';

// Who can work the win-back board — office roles that follow up on customers.
export function canWorkOpportunities(role) { return can(role, 'contactCustomer') || can(role, 'seeReports') || can(role, 'assignJobs'); }

export const OPP_KINDS = {
  recommendation:     { label: 'Tech rec',          icon: '📌', badge: 'var(--amber)' },
  declined_estimate:  { label: 'Declined estimate', icon: '📄', badge: 'var(--red)' },
  aging_water_heater: { label: 'Aging heater',      icon: '🔥', badge: '#c79141' },
};

// Fuel → the replacement pitch Devin wants (never swap gas↔propane; that stays a safety rule elsewhere).
const FUEL_PITCH = {
  gas: 'power-vent or tankless',
  propane: 'tankless / high-efficiency',
  electric: 'a hybrid heat-pump',
};
const fuelOf = (f) => { const s = String(f || '').toLowerCase(); return /propane|lp\b/.test(s) ? 'propane' : /gas/.test(s) ? 'gas' : /electric/.test(s) ? 'electric' : ''; };

// Stable ref per source row so a Won/Dismiss marker can be matched back (native recs use their own uuid).
export const refFor = (kind, id) => (kind === 'recommendation' ? String(id) : `${kind === 'declined_estimate' ? 'est' : 'wh'}:${id}`);

// ── Source 1: tech recommendations (already persisted) ──────────────────────────────────────────────
export async function openRecs(sb) {
  try {
    const { data } = await sb.from('opportunities').select('id, customer_id, job_id, title, detail, est_value_cents, created_at, created_by_name')
      .eq('kind', 'recommendation').eq('status', 'open').order('created_at', { ascending: false }).limit(500);
    return (data || []).map((o) => ({
      ref: refFor('recommendation', o.id), oppId: o.id, kind: 'recommendation', customerId: o.customer_id, jobId: o.job_id,
      title: o.title, detail: o.detail || (o.created_by_name ? `Flagged by ${o.created_by_name}` : ''), valueCents: o.est_value_cents || null, at: o.created_at,
    }));
  } catch (_) { return []; }
}

// ── Source 2: declined estimates (live) ─────────────────────────────────────────────────────────────
export async function declinedEstimates(sb) {
  try {
    const { data } = await sb.from('pricebook_estimates')
      .select('id, customer_id, job_id, customer_name, headline, customer_description, subtotal, decline_reason, responded_at, created_at')
      .eq('status', 'declined').order('responded_at', { ascending: false, nullsFirst: false }).limit(500);
    return (data || []).map((e) => ({
      ref: refFor('declined_estimate', e.id), oppId: null, kind: 'declined_estimate', customerId: e.customer_id, jobId: e.job_id,
      customerName: e.customer_name || '', title: e.headline || e.customer_description || 'Declined estimate',
      detail: e.decline_reason ? `Reason: ${e.decline_reason}` : 'Customer declined — offer it again.',
      valueCents: Math.round((Number(e.subtotal) || 0) * 100) || null, at: e.responded_at || e.created_at,
    })).filter((r) => r.customerId);
  } catch (_) { return []; }
}

// ── Source 3: aging water heaters (live, newest unit per customer) ───────────────────────────────────
// Returns one row per customer whose NEWEST water heater is 9+ yrs old — so a replaced unit (newer plate)
// drops off automatically. Mirrors resolveAudience's WH logic but keeps the fuel/year for the pitch.
export async function agingWaterHeaters(sb, nowYear) {
  const curYear = nowYear || 0; // caller passes the Eastern year (Date.now() is unavailable in some contexts)
  const maxYear = curYear - WH_AGE_YEARS;
  const newest = new Map();
  try {
    let from = 0;
    while (true) {
      const { data, error } = await sb.from('customer_equipment').select('customer_id, fuel_type, year, type, created_at').not('customer_id', 'is', null).range(from, from + 999);
      if (error || !data || !data.length) break;
      data.forEach((e) => {
        if (/furnace|boiler|hvac|\bac\b|softener|sump|pump/i.test(String(e.type || ''))) return;
        const yr = Number(e.year) || 0;
        const cur = newest.get(e.customer_id);
        const newer = !cur || yr > cur.year || (yr === cur.year && new Date(e.created_at) > new Date(cur.created_at));
        if (newer) newest.set(e.customer_id, { year: yr, fuel: fuelOf(e.fuel_type) });
      });
      if (data.length < 1000) break; from += 1000;
    }
  } catch (_) { return []; }
  const rows = [];
  for (const [cid, u] of newest) {
    if (!u.year || u.year > maxYear || !u.fuel) continue; // recent, unknown year, or unknown fuel → skip
    const age = curYear - u.year;
    rows.push({
      ref: refFor('aging_water_heater', cid), oppId: null, kind: 'aging_water_heater', customerId: cid, jobId: null,
      title: `${age}-yr ${u.fuel} water heater`, detail: `Pitch ${FUEL_PITCH[u.fuel] || 'a high-efficiency replacement'} before it fails and floods.`,
      valueCents: null, fuel: u.fuel, ageYears: age, at: null,
    });
  }
  return rows.sort((a, b) => b.ageYears - a.ageYears);
}

// Markers = opportunities rows that record a status decision (won/dismissed/sent) on a LIVE-source item.
// Keyed by `source` = the ref. Native recs carry their status on the row itself.
export async function loadMarkers(sb) {
  try {
    const { data } = await sb.from('opportunities').select('id, source, status, kind, customer_id').in('kind', ['declined_estimate', 'aging_water_heater']).limit(2000);
    const byRef = new Map();
    (data || []).forEach((m) => { if (m.source) byRef.set(m.source, m); });
    return byRef;
  } catch (_) { return new Map(); }
}

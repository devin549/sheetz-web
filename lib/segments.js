// P8 segment engine — pure logic for the job-segment lifecycle + the parent-job rollup. A job has many
// segments (sessions); everything rolls UP to the parent. No Date.now() inside (pass `now`) so it runs
// identically on server + client. Money in cents.
import { computeMargin, MARGIN_TARGET } from './marginCoach';

// The right-click "Split / Add…" menu — label + what each creates. Order = menu order.
export const SEGMENT_KINDS = [
  { kind: 'work_segment', label: 'Split / Add Work Segment', icon: '🪓' },
  { kind: 'second_tech',  label: 'Add second tech',          icon: '👷' },
  { kind: 'helper',       label: 'Add helper',               icon: '🧑‍🔧' },
  { kind: 'return_visit', label: 'Add return visit',         icon: '↩️' },
  { kind: 'unit_phase',   label: 'Add unit / phase',         icon: '🏢' },
  { kind: 'callback',     label: 'Add callback segment',     icon: '📞' },
  { kind: 'parts_run',    label: 'Parts run',                icon: '🚐' },
];
export const kindLabel = (k) => (SEGMENT_KINDS.find((s) => s.kind === k) || {}).label || k;
export const kindIcon = (k) => (SEGMENT_KINDS.find((s) => s.kind === k) || {}).icon || '•';

export const SEGMENT_STATUSES = ['draft', 'live_not_active', 'active', 'done', 'cancelled'];
export const statusLabel = (s) => ({ draft: 'Draft', live_not_active: 'Live (not active)', active: 'Active', done: 'Done', cancelled: 'Cancelled' }[s] || s);

// Next internal segment number: parent job number + a letter (B, C, …). Parent itself is implicitly "A".
export function nextSegmentNo(parentNumber, existingCount) {
  const base = String(parentNumber || '').trim() || 'JOB';
  const letter = String.fromCharCode(66 + Math.max(0, existingCount)); // 66 = 'B'
  return `${base}-${letter}`;
}

// Labor minutes for one segment: frozen labor_min when done, else live from started_at while active.
export function segmentLaborMin(seg, now) {
  if (seg == null) return 0;
  if (Number.isFinite(seg.labor_min) && seg.labor_min != null) return Math.max(0, seg.labor_min);
  if (seg.status === 'active' && seg.started_at) return Math.max(0, Math.round((now - Date.parse(seg.started_at)) / 60000));
  if (seg.started_at && seg.ended_at) return Math.max(0, Math.round((Date.parse(seg.ended_at) - Date.parse(seg.started_at)) / 60000));
  return 0;
}

// A segment counts toward the board/capacity once it's live (not draft/cancelled).
export const isLive = (seg) => seg && ['live_not_active', 'active'].includes(seg.status);
// "active" is the only state that attaches new labor/photos/parts.
export const isActive = (seg) => seg && seg.status === 'active';

// ── Split-job pay — ports the Tech Sheet "Split" rule ─────────────────────────────────────────────────
// When 2+ TECHS work one job, the job's COMMISSION splits EVENLY among them; a SALARY tech takes $0 extra
// (their share is NOT redistributed — the commission tech still gets only their half, exactly like a
// tech-to-tech split). Helpers are excluded (paid at cost, not commission). Revenue also counts 50/50 to
// each tech's numbers/leaderboard. crew = [{ id, name, pay_type, kind }]; kind 'lead'|'second_tech' = a tech.
const isSalaryType = (t) => /salary/i.test(String(t || ''));
const techsOnly = (crew) => (crew || []).filter((c) => c.kind !== 'helper');

// 2+ techs on the job (helpers don't count) = a split job.
export function isSplitJob(crew = []) {
  return techsOnly(crew).length >= 2;
}

// Each tech's commission share. Salary techs → 0 (not redistributed). Money in cents.
export function splitCommission(totalCommissionCents, crew = []) {
  const techs = techsOnly(crew);
  const n = techs.length || 1;
  const evenShare = Math.round((Number(totalCommissionCents) || 0) / n);
  return techs.map((t) => {
    const salary = isSalaryType(t.pay_type);
    return { id: t.id || null, name: t.name || 'Tech', kind: t.kind || 'lead', isSalary: salary, shareCents: salary ? 0 : evenShare };
  });
}

// Revenue credited to each tech's numbers (50/50 on a 2-tech split). Money in cents.
export function splitRevenue(totalRevenueCents, crew = []) {
  const techs = techsOnly(crew);
  const n = techs.length || 1;
  const share = Math.round((Number(totalRevenueCents) || 0) / n);
  return techs.map((t) => ({ id: t.id || null, name: t.name || 'Tech', revenueCents: share }));
}

// Roll EVERYTHING up to the parent: crew, labor, parts (receipts), photos-by-segment, margin health.
export function rollupJob({ job = {}, segments = [], receipts = [], photos = [], now = 0 }) {
  const live = segments.filter((s) => s.status !== 'cancelled');
  const crew = new Map();
  const norm = (n) => String(n || '').trim().toLowerCase();
  // dedup key prefers tech_id; falls back to normalized name so the lead doing a parts run isn't double-counted.
  const keyFor = (id, name) => (id ? `id:${id}` : `nm:${norm(name)}`);
  const nameKeys = new Set();
  // parent's own assigned tech counts as the lead
  if (job.tech_name || job.tech_id) { crew.set(keyFor(job.tech_id, job.tech_name), { id: job.tech_id, name: job.tech_name || 'Lead', lead: true, kind: 'lead' }); if (job.tech_name) nameKeys.add(norm(job.tech_name)); }
  live.forEach((s) => {
    const k = keyFor(s.assigned_tech_id, s.assigned_tech_name);
    // a name-only segment whose name matches someone already on the crew = same person (e.g. lead's parts run)
    if (!s.assigned_tech_id && nameKeys.has(norm(s.assigned_tech_name))) return;
    if ((s.assigned_tech_id || s.assigned_tech_name) && !crew.has(k)) {
      crew.set(k, { id: s.assigned_tech_id, name: s.assigned_tech_name || 'Crew', lead: false, kind: s.kind });
      if (s.assigned_tech_name) nameKeys.add(norm(s.assigned_tech_name));
    }
  });

  const laborMin = live.reduce((sum, s) => sum + segmentLaborMin(s, now), 0);
  const billableReceipts = receipts.filter((r) => r.billable !== false);
  const partsCents = billableReceipts.reduce((sum, r) => sum + (Number(r.total_cents) || 0), 0);
  const partsRuns = live.filter((s) => s.kind === 'parts_run');

  // photos grouped by segment id ('' = attached to the parent, no segment)
  const photosBySegment = {};
  photos.forEach((p) => { const k = p.segment_id || ''; (photosBySegment[k] = photosBySegment[k] || []).push(p); });

  // Margin health: revenue vs the REAL rolled-up cost (parent material + billable receipts + dispatch fee).
  const revenue = Number(job.amount) || 0;
  const materialCost = ((Number(job.material_cost_cents) || 0) + partsCents) / 100;
  const dispatchFee = (Number(job.dispatch_fee_cents) || 0) / 100;
  const m = revenue > 0 ? computeMargin({ revenue, materialCost, dispatchFee }) : null;
  const health = m ? (m.pct >= MARGIN_TARGET ? 'good' : m.pct >= MARGIN_TARGET - 15 ? 'watch' : 'bad') : 'unknown';

  return {
    segments: live,
    crew: [...crew.values()],
    techCount: [...crew.values()].filter((c) => c.kind !== 'helper').length,
    helperCount: [...crew.values()].filter((c) => c.kind === 'helper').length,
    laborMin,
    laborHrs: Math.round((laborMin / 60) * 10) / 10,
    partsCents,
    receiptCount: receipts.length,
    partsRuns: partsRuns.length,
    photoCount: photos.length,
    photosBySegment,
    margin: m,                 // { pct, rev, cost, overBy } or null
    marginTarget: MARGIN_TARGET,
    health,                    // good | watch | bad | unknown
  };
}

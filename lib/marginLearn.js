// 📉 Margin learning + leak radar (audit #10). The company's own closed jobs ARE the price book: for each
// job type we learn the typical ticket + margin from history, then flag the jobs that leak money —
// underbilled vs the type's norm, thin margin, padded/over-claimed parts, or revenue booked with no cost
// entered (a fake-high margin or parts given away). Pure functions → identical on server + client, fully
// testable. Money is handled in CENTS end-to-end (revenue `amount` is dollars → ×100 on the way in).
//
// This is a MANAGER/OWNER lens (financials) — never tech-facing. It estimates dollars, it never charges
// or edits a job; a human reviews each flag and dispositions it.

import { MARGIN_TARGET } from './marginCoach';

const cents = (dollars) => Math.round((Number(dollars) || 0) * 100);
const num = (n) => Number(n) || 0;
const lc = (s) => String(s == null ? '' : s).trim().toLowerCase();

// A job is "closed/billable" for learning if it has positive revenue and a terminal-ish status.
const CLOSED = new Set(['completed', 'complete', 'closed', 'done', 'invoiced', 'paid', 'finished']);

function median(sorted) {
  if (!sorted.length) return 0;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : Math.round((sorted[m - 1] + sorted[m]) / 2);
}
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

// Normalize a raw job row → the fields the engine uses (cents).
export function normJob(j) {
  j = j || {};
  return {
    id: j.id,
    type: lc(j.job_type || j.service_type || 'other') || 'other',
    typeLabel: String(j.job_type || j.service_type || 'Other'),
    customer: j.customer_name || j.customer || '',
    tech: j.tech_name || j.assigned_to || '',
    status: lc(j.status),
    revenueCents: cents(j.amount),
    materialCents: num(j.material_cost_cents),
    dispatchCents: num(j.dispatch_fee_cents),
    hasReceipt: j.has_receipt === true, // optional; caller may enrich
  };
}
const isClosed = (n) => n.revenueCents > 0 && (CLOSED.has(n.status) || !n.status);
const marginPct = (n) => (n.revenueCents <= 0 ? 0 : Math.round(((n.revenueCents - n.materialCents - n.dispatchCents) / n.revenueCents) * 100));
const materialRatio = (n) => (n.revenueCents <= 0 ? 0 : n.materialCents / n.revenueCents);

const MIN_SAMPLE = 5; // need this many closed jobs of a type before we trust its baseline

// Learn a per-job-type baseline from history. Returns a Map keyed by type.
export function learnBaselines(rawJobs) {
  const byType = new Map();
  (rawJobs || []).map(normJob).filter(isClosed).forEach((n) => {
    if (!byType.has(n.type)) byType.set(n.type, { type: n.type, label: n.typeLabel, rev: [], margin: [], mat: [], ratio: [] });
    const b = byType.get(n.type);
    b.rev.push(n.revenueCents); b.margin.push(marginPct(n)); b.mat.push(n.materialCents); b.ratio.push(materialRatio(n));
  });
  const out = new Map();
  for (const [type, b] of byType) {
    const rev = b.rev.slice().sort((a, c) => a - c);
    const margin = b.margin.slice().sort((a, c) => a - c);
    const mat = b.mat.slice().sort((a, c) => a - c);
    const ratio = b.ratio.slice().sort((a, c) => a - c);
    out.set(type, {
      type, label: b.label, n: b.rev.length,
      medianRevenue: median(rev), lowRevenue: percentile(rev, 25), // p25 = the "underbilled below here" line
      medianMargin: median(margin), medianMaterial: median(mat),
      medianRatio: ratio.length ? ratio[Math.floor(ratio.length / 2)] : 0,
      trusted: b.rev.length >= MIN_SAMPLE,
    });
  }
  return out;
}

// Flag the leaks on a set of (already-closed) jobs against the learned baselines.
// Returns { flags: [...], totalLeakCents, byReason } sorted worst-first.
export function flagLeaks(rawJobs, baselines, opts = {}) {
  const target = opts.target || MARGIN_TARGET;
  const flags = [];
  (rawJobs || []).map(normJob).filter(isClosed).forEach((n) => {
    const base = baselines.get(n.type);
    const reasons = [];
    let leak = 0;
    const mPct = marginPct(n);

    // 1) Thin margin — always checkable against the fixed company target.
    if (n.materialCents + n.dispatchCents > 0 && mPct < target) {
      const ceiling = Math.round(n.revenueCents * (1 - target / 100)); // max cost to hit target
      const over = Math.max(0, (n.materialCents + n.dispatchCents) - ceiling);
      if (over > 0) { reasons.push({ code: 'thin_margin', label: `Thin margin (${mPct}% vs ${target}%)`, cents: over }); leak += over; }
    }

    // 2) Underbilled vs the type's norm (only when we trust the baseline).
    if (base && base.trusted && n.revenueCents > 0 && n.revenueCents < base.lowRevenue) {
      const gap = base.medianRevenue - n.revenueCents; // money left on the table vs a typical ticket
      if (gap > 1000) { reasons.push({ code: 'underbilled', label: `Underbilled — ${fmt(n.revenueCents)} vs ${fmt(base.medianRevenue)} typical`, cents: gap }); leak += gap; }
    }

    // 3) Padded / over-claimed parts — material is a far higher share of the ticket than the type's norm.
    if (base && base.trusted && base.medianRatio > 0 && n.materialCents > 0) {
      const r = materialRatio(n);
      if (r > base.medianRatio * 2 && r > 0.4) {
        const expected = Math.round(n.revenueCents * base.medianRatio);
        const excess = Math.max(0, n.materialCents - expected);
        if (excess > 2500) reasons.push({ code: 'parts_overclaim', label: `Parts unusually high (${Math.round(r * 100)}% of ticket vs ${Math.round(base.medianRatio * 100)}% typical)`, cents: excess });
      }
    }

    // 4) No-receipt parts claim — material entered but no receipt on file (doc-fraud / theft watch).
    if (n.materialCents >= 5000 && n.hasReceipt === false && opts.receiptsKnown) {
      reasons.push({ code: 'no_receipt', label: `${fmt(n.materialCents)} in parts claimed, no receipt on file`, cents: 0 });
    }

    // 5) Revenue with zero cost on a type that normally uses parts — fake-high margin or parts given free.
    if (n.materialCents === 0 && base && base.trusted && base.medianMaterial >= 5000 && n.revenueCents > 0) {
      reasons.push({ code: 'no_cost', label: `No material cost entered (type usually ~${fmt(base.medianMaterial)})`, cents: 0 });
    }

    if (reasons.length) {
      const severity = leak >= 15000 ? 'high' : leak >= 5000 || reasons.some((r) => r.code === 'no_receipt') ? 'med' : 'low';
      flags.push({ id: n.id, type: n.type, typeLabel: n.typeLabel, customer: n.customer, tech: n.tech, revenueCents: n.revenueCents, marginPct: mPct, leakCents: leak, severity, reasons });
    }
  });

  flags.sort((a, b) => (b.leakCents - a.leakCents) || (sevRank(b.severity) - sevRank(a.severity)));
  const byReason = {};
  flags.forEach((f) => f.reasons.forEach((r) => { byReason[r.code] = (byReason[r.code] || 0) + 1; }));
  return { flags, totalLeakCents: flags.reduce((s, f) => s + f.leakCents, 0), byReason, count: flags.length };
}

const sevRank = (s) => (s === 'high' ? 3 : s === 'med' ? 2 : 1);
export function fmt(c) { return '$' + Math.round((Number(c) || 0) / 100).toLocaleString(); }
export const REASON_META = {
  thin_margin: { icon: '📉', color: 'var(--red)' },
  underbilled: { icon: '🩸', color: 'var(--red)' },
  parts_overclaim: { icon: '🧾', color: 'var(--amber)' },
  no_receipt: { icon: '🐀', color: 'var(--amber)' },
  no_cost: { icon: '❓', color: 'var(--muted)' },
};

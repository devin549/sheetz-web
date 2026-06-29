// Match scanned receipts to their work order (job) and surface ONLY clear discrepancies — we never want to
// false-accuse a tech, so thresholds are deliberately forgiving. Pure (no I/O): takes jobs + receipts and
// returns the discrepancies. The caller turns each into a flag (1st per tech = warning, then Doc Fraud Fee).

export const MISSING_MIN_CENTS = 2500;   // ignore tiny material spend (<$25) — not worth flagging a missing receipt
export const MISMATCH_ABS_CENTS = 1000;  // $10 absolute tolerance
export const MISMATCH_PCT = 0.10;        // ...or 10% of the job's material cost, whichever is larger

export function withinTolerance(receiptCents, costCents) {
  const diff = Math.abs((Number(receiptCents) || 0) - (Number(costCents) || 0));
  return diff <= MISMATCH_ABS_CENTS || diff <= (Number(costCents) || 0) * MISMATCH_PCT;
}

// jobs: [{ id, job_number, tech_id, tech_name, material_cost_cents }]
// receiptsByJob: { [jobId]: [{ amount_cents }] }  — receipts already on file for that job
// Returns [{ job_id, job_number, tech_id, tech_name, kind: 'receipt_missing'|'receipt_mismatch', detail }]
export function reconcileReceipts(jobs, receiptsByJob = {}) {
  const out = [];
  for (const j of jobs || []) {
    const cost = Number(j.material_cost_cents) || 0;
    if (cost < MISSING_MIN_CENTS) continue;                       // no material cost worth a receipt
    const receipts = (receiptsByJob[j.id] || []).filter((r) => (Number(r.amount_cents) || 0) > 0);
    const base = { job_id: j.id, job_number: j.job_number || '', tech_id: j.tech_id || null, tech_name: j.tech_name || '' };
    if (!receipts.length) { out.push({ ...base, kind: 'receipt_missing', detail: { cost_cents: cost } }); continue; }
    // Match if ANY single receipt OR the sum of receipts lands within tolerance of the booked material cost.
    const sum = receipts.reduce((s, r) => s + (Number(r.amount_cents) || 0), 0);
    const matched = receipts.some((r) => withinTolerance(r.amount_cents, cost)) || withinTolerance(sum, cost);
    if (!matched) out.push({ ...base, kind: 'receipt_mismatch', detail: { cost_cents: cost, receipt_cents: sum } });
  }
  return out;
}

// One warning, then the fee: a tech's FIRST receipt discrepancy is a warning; every one after is a Doc Fraud
// Fee (and the work gets flagged). priorOpenFlags = how many open flags this tech already has.
export function flagLevel(priorOpenFlags) { return (Number(priorOpenFlags) || 0) >= 1 ? 'fee' : 'warning'; }

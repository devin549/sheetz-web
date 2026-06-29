// 🧾→💳 The bridge: an APPROVED estimate becomes an invoice. Called once per approval (both the customer
// link-approve and the tech "sold in person" path), AFTER the approval is locked in. Creates an `invoices`
// row (open, balance = total) tied to the job so the Invoice tab, collection, and AR all see real money.
// Net terms (migration 132) set the due date; otherwise it's due now. Best-effort + degrades on older schemas
// (due_date is migration 133). Never throws — a failed invoice must not break the customer's approval.

const DAY = 86400000;

export async function createInvoiceFromEstimate(sb, { customerId, jobId, jobNumber, total }) {
  const t = Math.round((Number(total) || 0) * 100) / 100;
  if (!sb || !jobId || t <= 0) return { ok: false };

  // Don't double-invoice a job (defensive — approval is already once-only, but a re-approval edge shouldn't
  // stack invoices). If an open invoice already exists for this job, leave it.
  try {
    const { data: existing } = await sb.from('invoices').select('invoice_number').eq('job_id', String(jobId)).limit(1);
    if (existing && existing.length) return { ok: true, already: true };
  } catch (_) { /* job_id column may be absent on an old schema — fall through and insert */ }

  // Net-30/15 (migration 132) → due in N days; else due now. Best-effort.
  let netDays = 0;
  try { if (customerId) { const { data: c } = await sb.from('customers').select('net_terms_days').eq('id', customerId).maybeSingle(); netDays = Number(c?.net_terms_days) || 0; } } catch (_) {}
  const now = new Date();
  const invNo = jobNumber ? `INV-${jobNumber}` : `INV-${String(jobId).slice(0, 8)}`;
  const full = {
    customer_id: customerId || null, job_id: String(jobId), invoice_number: invNo,
    total: t, balance: t, status: 'open', invoice_date: now.toISOString(),
    due_date: new Date(now.getTime() + netDays * DAY).toISOString(),
  };
  const colErr = (e) => e && /column|schema cache|does not exist/i.test(e.message || '');
  const withJob = { customer_id: full.customer_id, job_id: full.job_id, invoice_number: invNo, total: t, balance: t, status: 'open', invoice_date: full.invoice_date }; // pre-133 (no due_date) but keep job_id
  const core = { customer_id: full.customer_id, invoice_number: invNo, total: t, balance: t, status: 'open', invoice_date: full.invoice_date }; // very old schema, no job_id
  let { error } = await sb.from('invoices').insert(full);
  if (colErr(error)) { ({ error } = await sb.from('invoices').insert(withJob)); }
  if (colErr(error)) { ({ error } = await sb.from('invoices').insert(core)); }
  if (error) return { ok: false, msg: error.message };
  return { ok: true, invoiceNumber: invNo, netDays, total: t };
}

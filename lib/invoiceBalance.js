// Atomic invoice balance apply (audit P2-18). Calls the apply_invoice_delta RPC (mig 166) so concurrent
// payments/refunds can't lose an update. FAIL-SOFT: if the RPC is missing (pre-166) or errors, falls back to
// the old read-modify-write so payment collection never breaks — it just loses the race protection until the
// migration is run.
//
// paidDollars: amount collected (positive) → reduces balance. Use applyRefund for money going back out.
export async function applyPayment(sb, invoiceId, paidDollars) {
  return applyDelta(sb, invoiceId, -Math.abs(Number(paidDollars) || 0));
}
export async function applyRefund(sb, invoiceId, refundDollars) {
  return applyDelta(sb, invoiceId, Math.abs(Number(refundDollars) || 0));
}

async function applyDelta(sb, invoiceId, delta) {
  if (!invoiceId) return { ok: false };
  try {
    const { data, error } = await sb.rpc('apply_invoice_delta', { p_invoice_id: invoiceId, p_delta: delta });
    if (!error) return { ok: true, balance: Number(data) };
    // fall through to the legacy path on RPC-missing / any error
  } catch (_) { /* fall through */ }
  // Legacy fallback (read-modify-write) — only used until mig 166 is applied.
  try {
    const { data: inv } = await sb.from('invoices').select('balance').eq('id', invoiceId).maybeSingle();
    const cur = Number(inv?.balance) || 0;
    const newBal = Math.max(0, Math.round((cur + delta) * 100) / 100);
    const paidOff = newBal === 0;
    const reopen = delta > 0 && newBal > 0;
    const patch = { balance: newBal, ...(paidOff ? { status: 'paid', paid_at: new Date().toISOString() } : reopen ? { status: 'open' } : {}) };
    let u = await sb.from('invoices').update(patch).eq('id', invoiceId);
    if (u.error && /paid_at/.test(u.error.message || '')) { const { paid_at, ...lite } = patch; u = await sb.from('invoices').update(lite).eq('id', invoiceId); }
    return { ok: !u.error, balance: newBal };
  } catch (_) { return { ok: false }; }
}

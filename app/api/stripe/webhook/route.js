import { getStripe } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { applyPayment, applyRefund } from '@/lib/invoiceBalance';
import { sendOne, renderEmailHtml, isEmailConfigured } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stripe → us. Cards settle instantly; ACH/bank settles in days and can bounce — so we only mark an invoice
// PAID once the money truly clears. Set STRIPE_WEBHOOK_SECRET in Vercel.
function note(sb, body) { try { return sb.from('cb_comms').insert({ channel: 'system', direction: 'in', to_addr: 'AR', from_name: 'Stripe', body, status: 'sent' }); } catch (_) {} }

async function reconcilePaid(sb, s) {
  const md = s.metadata || {};
  const totalCents = Number(s.amount_total) || 0;
  const baseCents = Number(md.base_cents) || totalCents;
  const feeCents = Number(md.fee_cents) || 0;
  const paidDollars = Math.round(baseCents) / 100;
  const totalDollars = Math.round(totalCents) / 100;
  let newBalance = null; // dollars left on the invoice after this payment (null = unknown)
  if (md.invoice_id) {
    // SUBTRACT the amount actually paid — a partial/deposit payment reduces the balance, and only reaching 0
    // flips to 'paid'. Atomic (audit P2-18): apply_invoice_delta locks the row so a concurrent card+cash or a
    // webhook retry can't lose an update or double-apply.
    try { const ap = await applyPayment(sb, md.invoice_id, paidDollars); if (ap?.ok && Number.isFinite(ap.balance)) newBalance = ap.balance; } catch (_) {}
  }
  try { await sb.from('ar_activity').insert({ action: 'customer_paid', customer_id: md.customer_id || null, customer_name: md.customer_name || null, invoice_id: md.invoice_id || null, invoice_number: md.invoice_number || null, amount: paidDollars, by_email: 'stripe' }); } catch (_) {}
  const feeBit = feeCents ? ` ($${paidDollars.toLocaleString()} + $${(feeCents / 100).toLocaleString()} card fee)` : '';
  const onInv = md.invoice_number ? ` on invoice ${md.invoice_number}` : '';
  const fromWho = md.customer_name ? ` from ${md.customer_name}` : '';
  await note(sb, `💳 Payment received: $${totalDollars.toLocaleString()}${feeBit}${onInv}${fromWho}.`);
  // 📧 Email the customer OUR paid receipt — a pay-link settled at home went silent before this (the field
  // cash/check flow already receipts; this is the online twin). Best-effort: a receipt failure must NEVER
  // 500 the webhook (that would release the event claim and re-run reconcile on Stripe's retry).
  try {
    if (isEmailConfigured && md.customer_id) {
      const { data: cust } = await sb.from('customers').select('name, email, email2').eq('id', md.customer_id).maybeSingle();
      const emails = [...new Set([cust?.email, cust?.email2].map((e) => String(e || '').trim().toLowerCase()).filter((e) => /.+@.+\..+/.test(e)))];
      if (emails.length) {
        const first = String(cust?.name || md.customer_name || 'there').trim().split(/\s+/)[0] || 'there';
        const feeLine = feeCents ? ` (includes the $${(feeCents / 100).toFixed(2)} card fee)` : '';
        const balNote = newBalance == null ? 'Thank you for your business!'
          : newBalance > 0 ? `Remaining balance on this invoice: $${newBalance.toFixed(2)}.`
          : 'Your invoice is now paid in full. Thank you!';
        const body = `Hi ${first},\n\nThank you! This confirms we received your online payment of $${totalDollars.toFixed(2)}${feeLine}${md.invoice_number ? ` on invoice ${md.invoice_number}` : ''}.\n\n${balNote}`;
        await sendOne({ to: emails[0], cc: emails.slice(1).join(',') || undefined, subject: 'Payment receipt — Clog Busterz Plumbing', html: renderEmailHtml({ subject: 'Payment receipt — Clog Busterz Plumbing', body }), meta: { customerId: md.customer_id, purpose: 'receipt', ref: md.invoice_number || null } });
      }
    }
  } catch (_) { /* receipt is best-effort */ }
}

// Money going BACK OUT — a refund or a chargeback (dispute). Reverses what reconcilePaid did: RE-OPENS the
// invoice (adds the refunded base back to the balance, status→open) and posts a NEGATIVE ar_activity row so
// the books reflect the reversal instead of leaving it booked as collected. baseCents = the refunded amount
// that applied to the invoice (excludes the card fee).
async function reverseCharge(sb, md = {}, baseCents = 0, kind = 'refund') {
  const dollars = Math.round(Number(baseCents) || 0) / 100;
  if (md.invoice_id) {
    // Re-open the invoice for the refunded base — atomic add (audit P2-18), row-locked so it can't race a
    // concurrent payment on the same invoice.
    try { await applyRefund(sb, md.invoice_id, dollars); } catch (_) {}
  }
  try { await sb.from('ar_activity').insert({ action: kind === 'chargeback' ? 'customer_chargeback' : 'customer_refunded', customer_id: md.customer_id || null, customer_name: md.customer_name || null, invoice_id: md.invoice_id || null, invoice_number: md.invoice_number || null, amount: -dollars, by_email: 'stripe' }); } catch (_) {}
  const onInv = md.invoice_number ? ` on invoice ${md.invoice_number}` : '';
  const who = md.customer_name ? ` · ${md.customer_name}` : '';
  await note(sb, kind === 'chargeback'
    ? `⚠️ CHARGEBACK: $${dollars.toLocaleString()}${onInv}${who} — disputed, invoice RE-OPENED. Respond in Stripe before the deadline.`
    : `↩️ Refund: $${dollars.toLocaleString()}${onInv}${who} — invoice re-opened.`);
}

export async function POST(request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response('not configured', { status: 500 });

  const sig = request.headers.get('stripe-signature');
  const body = await request.text();
  let event;
  try { event = stripe.webhooks.constructEvent(body, sig, secret); }
  catch (e) { return new Response('bad signature: ' + String((e && e.message) || e).slice(0, 80), { status: 400 }); }

  const sb = getSupabaseAdmin();
  const s = event.data && event.data.object || {};
  const md = s.metadata || {};
  // Idempotency: Stripe delivers at-least-once and retries until it gets a 2xx. CLAIM the event id FIRST —
  // the PK insert is the lock, so only the first delivery wins and a retry hits a duplicate and is skipped
  // BEFORE re-processing. (The old check-then-act inserted the id AFTER reconcile, leaving a window where a
  // retry of a slow/crashed run re-ran reconcile and double-wrote AR.) Pre-mig-136 (table missing) the insert
  // throws → we proceed un-deduped, same as before.
  let claimed = false;
  if (sb) {
    try {
      const { error } = await sb.from('stripe_events').insert({ id: event.id, type: event.type });
      if (!error) claimed = true;
      else if (/duplicate|unique|23505/i.test(error.message || '')) return Response.json({ received: true, deduped: true });
    } catch (_) { /* table missing → proceed without dedupe */ }
  }
  if (sb) {
    try {
      if (event.type === 'checkout.session.completed') {
        // Card = paid right now. ACH = "unpaid"/processing here → wait for async_payment_succeeded to clear.
        if (s.payment_status === 'paid') await reconcilePaid(sb, s);
        else await note(sb, `🏦 Bank payment initiated${md.customer_name ? ` from ${md.customer_name}` : ''}${md.invoice_number ? ` on invoice ${md.invoice_number}` : ''} — settling in a few days, not marked paid yet.`);
      } else if (event.type === 'checkout.session.async_payment_succeeded') {
        await reconcilePaid(sb, s); // ACH cleared → now mark it paid
      } else if (event.type === 'checkout.session.async_payment_failed') {
        await note(sb, `⚠️ Bank payment FAILED${md.customer_name ? ` from ${md.customer_name}` : ''}${md.invoice_number ? ` on invoice ${md.invoice_number}` : ''} — invoice stays open, follow up.`);
      } else if (event.type === 'charge.refunded') {
        // s = the charge; s.amount_refunded is CUMULATIVE across every refund on this charge. Re-open the
        // invoice ONLY for THIS refund's delta (audit P1-1: adding the cumulative each event double-credited
        // AR — $50 then $30 re-opened $50+$80=$130). previous_attributes.amount_refunded = the prior total, so
        // delta = new − prior; pro-rate the delta across the base/total split (exclude the card fee).
        const refunded = Number(s.amount_refunded) || 0, total = Number(s.amount) || 0;
        const prevRefunded = Number(event.data?.previous_attributes?.amount_refunded) || 0;
        const delta = Math.max(0, refunded - prevRefunded);
        const base = Number(md.base_cents) || total;
        const baseRefunded = Math.round(delta * (base / (total || 1)));
        await reverseCharge(sb, md, baseRefunded, 'refund');
      } else if (event.type === 'charge.dispute.created') {
        // s = the dispute; pull our metadata off the underlying PaymentIntent, then re-open + flag the chargeback.
        let dmd = md;
        try { if (s.payment_intent) { const pi = await stripe.paymentIntents.retrieve(s.payment_intent); dmd = pi.metadata || md; } } catch (_) {}
        const base = Number(dmd.base_cents) || Number(s.amount) || 0;
        await reverseCharge(sb, dmd, base, 'chargeback');
      }
    } catch (e) {
      // Processing failed AFTER claiming — release the claim so Stripe's retry re-runs it (return non-2xx).
      if (claimed) { try { await sb.from('stripe_events').delete().eq('id', event.id); } catch (_) {} }
      return new Response('processing error', { status: 500 });
    }
  }
  return Response.json({ received: true });
}

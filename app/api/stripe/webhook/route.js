import { getStripe } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

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
  if (md.invoice_id) {
    try {
      // SUBTRACT the amount actually paid — never blindly zero the balance. A partial/deposit payment
      // (e.g. $100 on a $2,000 invoice) must reduce the balance, NOT mark the whole thing paid; only flip
      // to 'paid' when the balance reaches 0. If we can't read the current balance, fall back to the old
      // mark-paid behavior (most payments ARE the full amount).
      let newBal = 0, known = false;
      try { const { data: inv } = await sb.from('invoices').select('balance').eq('id', md.invoice_id).maybeSingle(); if (inv && inv.balance != null) { newBal = Math.max(0, Math.round((Number(inv.balance) - paidDollars) * 100) / 100); known = true; } } catch (_) {}
      const paidOff = !known || newBal === 0;
      const bal = known ? newBal : 0;
      const r = await sb.from('invoices').update({ balance: bal, ...(paidOff ? { status: 'paid', paid_at: new Date().toISOString() } : {}) }).eq('id', md.invoice_id);
      if (r.error && /paid_at/.test(r.error.message || '')) await sb.from('invoices').update({ balance: bal, ...(paidOff ? { status: 'paid' } : {}) }).eq('id', md.invoice_id);
    } catch (_) {}
  }
  try { await sb.from('ar_activity').insert({ action: 'customer_paid', customer_id: md.customer_id || null, customer_name: md.customer_name || null, invoice_id: md.invoice_id || null, invoice_number: md.invoice_number || null, amount: paidDollars, by_email: 'stripe' }); } catch (_) {}
  const feeBit = feeCents ? ` ($${paidDollars.toLocaleString()} + $${(feeCents / 100).toLocaleString()} card fee)` : '';
  const onInv = md.invoice_number ? ` on invoice ${md.invoice_number}` : '';
  const fromWho = md.customer_name ? ` from ${md.customer_name}` : '';
  await note(sb, `💳 Payment received: $${totalDollars.toLocaleString()}${feeBit}${onInv}${fromWho}.`);
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
      }
    } catch (e) {
      // Processing failed AFTER claiming — release the claim so Stripe's retry re-runs it (return non-2xx).
      if (claimed) { try { await sb.from('stripe_events').delete().eq('id', event.id); } catch (_) {} }
      return new Response('processing error', { status: 500 });
    }
  }
  return Response.json({ received: true });
}

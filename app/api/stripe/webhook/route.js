import { getStripe } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stripe → us. When a customer pays a pay-link, mark the invoice paid + log it to the AR ledger.
// Set STRIPE_WEBHOOK_SECRET in Vercel (from the Stripe dashboard webhook you point at this URL).
export async function POST(request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response('not configured', { status: 500 });

  const sig = request.headers.get('stripe-signature');
  const body = await request.text(); // raw body required for signature verification
  let event;
  try { event = stripe.webhooks.constructEvent(body, sig, secret); }
  catch (e) { return new Response('bad signature: ' + String((e && e.message) || e).slice(0, 80), { status: 400 }); }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object || {};
    const md = s.metadata || {};
    const sb = getSupabaseAdmin();
    if (sb) {
      const paidCents = Number(s.amount_total) || 0;
      const paidDollars = Math.round(paidCents) / 100;
      // Mark the invoice paid (best-effort; tolerate schema differences).
      if (md.invoice_id) {
        try {
          let r = await sb.from('invoices').update({ status: 'paid', balance: 0, paid_at: new Date().toISOString() }).eq('id', md.invoice_id);
          if (r.error && /paid_at/.test(r.error.message || '')) await sb.from('invoices').update({ status: 'paid', balance: 0 }).eq('id', md.invoice_id);
        } catch (_) {}
      }
      // Log to the AR ledger (the accounting-bot trail).
      try {
        await sb.from('ar_activity').insert({
          action: 'customer_paid', customer_id: md.customer_id || null, customer_name: md.customer_name || null,
          invoice_id: md.invoice_id || null, invoice_number: md.invoice_number || null,
          amount: paidDollars, by_email: 'stripe',
        });
      } catch (_) {}
      // Surface it on the Comms Desk too.
      try {
        await sb.from('cb_comms').insert({ channel: 'system', direction: 'in', to_addr: 'AR', from_name: 'Stripe', body: `💳 Payment received: $${paidDollars.toLocaleString()}${md.invoice_number ? ` on invoice ${md.invoice_number}` : ''}${md.customer_name ? ` from ${md.customer_name}` : ''}.`, status: 'sent' });
      } catch (_) {}
    }
  }
  return Response.json({ received: true });
}

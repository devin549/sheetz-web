// Stripe — SERVER ONLY. Set STRIPE_SECRET_KEY in Vercel (use a TEST key sk_test_… first; flip to sk_live_…
// when you're ready). Pay links are a hosted Checkout page — no card data ever touches us.
import Stripe from 'stripe';

export const isStripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;
export const isStripeLive = () => String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live');

// Card convenience fee % added on pay links (set STRIPE_CARD_FEE_PCT in Vercel; default 4). 0 = no fee.
export const cardFeePct = () => { const n = Number(process.env.STRIPE_CARD_FEE_PCT); return Number.isFinite(n) && n >= 0 ? n : 4; };
export const feeCentsFor = (baseCents) => Math.round((Number(baseCents) || 0) * (cardFeePct() / 100));

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

function appOrigin() {
  return (process.env.APP_URL || 'https://sheetz-web.vercel.app').replace(/\/$/, '');
}

// Create a hosted Checkout pay-page for one invoice. amountCents = the balance to collect. Metadata lets the
// webhook reconcile the payment back to the invoice. Returns { ok, url } — never throws.
export async function createInvoiceCheckout({ amountCents, invoiceNumber, customerName, invoiceId, customerId }) {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: 'STRIPE_SECRET_KEY not set' };
  const cents = Math.round(Number(amountCents) || 0);
  if (cents < 50) return { ok: false, error: 'Amount must be at least $0.50' };
  const fee = feeCentsFor(cents); // 4% card convenience fee, shown as its own line
  try {
    const origin = appOrigin();
    const line_items = [{
      price_data: { currency: 'usd', product_data: { name: `Clog Busterz Plumbing${invoiceNumber ? ` — Invoice ${invoiceNumber}` : ''}` }, unit_amount: cents },
      quantity: 1,
    }];
    if (fee > 0) line_items.push({
      price_data: { currency: 'usd', product_data: { name: `Card convenience fee (${cardFeePct()}%)` }, unit_amount: fee },
      quantity: 1,
    });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      metadata: { invoice_id: invoiceId || '', customer_id: customerId || '', invoice_number: invoiceNumber || '', customer_name: customerName || '', base_cents: String(cents), fee_cents: String(fee) },
      success_url: `${origin}/pay/thanks`,
      cancel_url: `${origin}/pay/cancelled`,
    });
    return { ok: true, url: session.url, id: session.id, baseCents: cents, feeCents: fee, totalCents: cents + fee };
  } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
}

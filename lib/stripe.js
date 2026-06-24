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
export async function createInvoiceCheckout({ amountCents, invoiceNumber, customerName, invoiceId, customerId, method = 'card' }) {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: 'STRIPE_SECRET_KEY not set' };
  const cents = Math.round(Number(amountCents) || 0);
  if (cents < 50) return { ok: false, error: 'Amount must be at least $0.50' };
  const isAch = method === 'ach';
  const fee = isAch ? 0 : feeCentsFor(cents); // bank/ACH = NO convenience fee (it barely costs us)
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
    const md = { invoice_id: invoiceId || '', customer_id: customerId || '', invoice_number: invoiceNumber || '', customer_name: customerName || '', base_cents: String(cents), fee_cents: String(fee), method };
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: isAch ? ['us_bank_account'] : ['card'],
      line_items,
      metadata: md,
      payment_intent_data: { metadata: md }, // so the charge carries the fee split for the report
      success_url: `${origin}/pay/thanks`,
      cancel_url: `${origin}/pay/cancelled`,
    });
    return { ok: true, url: session.url, id: session.id, baseCents: cents, feeCents: fee, totalCents: cents + fee, method };
  } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
}

// "What we make on card fees" report — pulls real charges + Stripe's actual fee from the API.
export async function cardFeeReport(days = 60) {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: 'STRIPE_SECRET_KEY not set' };
  const since = Math.floor((Date.now() - days * 86400000) / 1000);
  try {
    let all = [], starting_after;
    for (let i = 0; i < 30; i++) {
      const page = await stripe.charges.list({ limit: 100, created: { gte: since }, ...(starting_after ? { starting_after } : {}), expand: ['data.balance_transaction'] });
      all.push(...page.data);
      if (!page.has_more || !page.data.length) break;
      starting_after = page.data[page.data.length - 1].id;
    }
    let n = 0, gross = 0, ourFee = 0, stripeCost = 0, refunded = 0, achN = 0, cardN = 0;
    all.forEach((c) => {
      if (c.status !== 'succeeded' || !c.paid) return;
      n++; gross += c.amount;
      const m = c.metadata || {};
      const f = m.fee_cents != null ? Number(m.fee_cents) : (m.base_cents != null ? c.amount - Number(m.base_cents) : Math.round(c.amount * (cardFeePct() / (100 + cardFeePct()))));
      ourFee += Number.isFinite(f) ? f : 0;
      const bt = c.balance_transaction;
      stripeCost += (bt && typeof bt === 'object' && bt.fee) ? bt.fee : 0;
      refunded += c.amount_refunded || 0;
      if ((m.method || (c.payment_method_details && c.payment_method_details.type)) === 'us_bank_account' || m.method === 'ach') achN++; else cardN++;
    });
    return { ok: true, days, n, cardN, achN, grossDollars: gross / 100, ourFeeDollars: ourFee / 100, stripeCostDollars: stripeCost / 100, netDollars: (ourFee - stripeCost) / 100, refundedDollars: refunded / 100 };
  } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
}

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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// STRIPE TERMINAL (WisePOS E) — in-person "tap/insert" collection at job close-out. SERVER-DRIVEN: we
// create a card_present PaymentIntent and push it to the reader; the customer taps on the reader, which
// talks to Stripe directly. No card data ever touches us. Needs the SAME STRIPE_SECRET_KEY as pay-links.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// One Terminal "location" groups your readers (Stripe requires it). Reuse STRIPE_TERMINAL_LOCATION if set,
// else create one named for the shop and return its id. Returns { ok, id } — never throws.
export async function ensureTerminalLocation() {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: 'STRIPE_SECRET_KEY not set' };
  const fixed = process.env.STRIPE_TERMINAL_LOCATION;
  if (fixed) return { ok: true, id: fixed };
  try {
    const existing = await stripe.terminal.locations.list({ limit: 1 });
    if (existing.data && existing.data[0]) return { ok: true, id: existing.data[0].id };
    const loc = await stripe.terminal.locations.create({
      display_name: 'Clog Busterz Plumbing',
      address: { line1: 'Service area', city: 'Richmond', state: 'KY', country: 'US', postal_code: '40475' },
    });
    return { ok: true, id: loc.id };
  } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
}

// Pair a physical WisePOS E to our account. The tech reads the 3-word pairing code off the reader screen
// (Settings → "Generate pairing code"). Returns the registered reader { ok, id, label, status }.
export async function registerTerminalReader({ registrationCode, label, locationId }) {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: 'STRIPE_SECRET_KEY not set' };
  try {
    const reader = await stripe.terminal.readers.create({
      registration_code: String(registrationCode || '').trim(),
      label: label || undefined,
      location: locationId,
    });
    return { ok: true, id: reader.id, label: reader.label || '', status: reader.status || '', deviceType: reader.device_type || '' };
  } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
}

// Create a card_present PaymentIntent for an in-person charge. capture_method auto = funds settle on tap.
// Mirrors createInvoiceCheckout's fee split so the card-fee report still reconciles. Returns { ok, id }.
export async function createCardPresentIntent({ amountCents, invoiceNumber, customerName, invoiceId, customerId }) {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: 'STRIPE_SECRET_KEY not set' };
  const cents = Math.round(Number(amountCents) || 0);
  if (cents < 50) return { ok: false, error: 'Amount must be at least $0.50' };
  const fee = feeCentsFor(cents);
  const total = cents + fee;
  const md = { invoice_id: invoiceId || '', customer_id: customerId || '', invoice_number: invoiceNumber || '', customer_name: customerName || '', base_cents: String(cents), fee_cents: String(fee), method: 'card_present' };
  try {
    const pi = await stripe.paymentIntents.create({
      amount: total,
      currency: 'usd',
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      description: `Clog Busterz Plumbing${invoiceNumber ? ` — Invoice ${invoiceNumber}` : ''}`,
      metadata: md,
    });
    return { ok: true, id: pi.id, baseCents: cents, feeCents: fee, totalCents: total };
  } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
}

// (Key-in / MOTO removed by Devin — createKeyedCardIntent + the keyed flow are gone. Reader is preferred;
// pay-link + ACH handle card-not-present.)

// Push a PaymentIntent to a specific reader → the reader prompts the customer to tap/insert. The actual
// tap is asynchronous, so the caller POLLS getCardPresentStatus() until it succeeds/fails. Returns { ok }.
export async function processIntentOnReader(readerId, paymentIntentId) {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: 'STRIPE_SECRET_KEY not set' };
  try {
    const reader = await stripe.terminal.readers.processPaymentIntent(readerId, { payment_intent: paymentIntentId });
    return { ok: true, readerStatus: reader.status || '', action: (reader.action && reader.action.status) || '' };
  } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
}

// Poll a card_present PaymentIntent. status: requires_payment_method (waiting on tap) | processing | succeeded
// | canceled | requires_capture. Returns { ok, status, paid }.
export async function getCardPresentStatus(paymentIntentId) {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: 'STRIPE_SECRET_KEY not set' };
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    // Our reader + keyed intents are capture_method:'automatic', so funds land on 'succeeded'. We deliberately
    // do NOT treat 'requires_capture' as paid: that status means the money is only AUTHORIZED, not captured —
    // marking an invoice paid then would book revenue that never settles. Only 'succeeded' = truly paid.
    const paid = pi.status === 'succeeded';
    return { ok: true, status: pi.status, paid, lastError: (pi.last_payment_error && pi.last_payment_error.message) || null };
  } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 200) }; }
}

// Cancel whatever the reader is currently prompting for (tech hit "Cancel" / customer walked). Best-effort.
export async function cancelReaderAction(readerId, paymentIntentId) {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: 'STRIPE_SECRET_KEY not set' };
  try { await stripe.terminal.readers.cancelAction(readerId); } catch (_) {}
  try { if (paymentIntentId) await stripe.paymentIntents.cancel(paymentIntentId); } catch (_) {}
  return { ok: true };
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

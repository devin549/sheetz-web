'use server';

// In-person card-reader (WisePOS E) collection at job close-out — the "Collect now" half of the close-out
// checkout (the "Send link" half is createJobPayLink in my-day/actions). Server-driven: we push a
// card_present PaymentIntent to a reader, the customer taps, we poll until it settles. No card data here.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import {
  isStripeConfigured, createCardPresentIntent, processIntentOnReader,
  getCardPresentStatus, cancelReaderAction, createKeyedCardIntent, createInvoiceCheckout,
} from '@/lib/stripe';
import { revalidatePath } from 'next/cache';

// Record a paid charge ONCE (idempotent on the PaymentIntent id) + flip the job's payment disposition to
// paid_card so the close-out checklist reflects it. Shared by the reader + keyed-entry flows.
async function recordPaidOnce(sb, jobId, profile, paymentIntentId, action) {
  try {
    const { data: already } = await sb.from('ar_activity').select('id').eq('action', action).eq('invoice_number', paymentIntentId).limit(1).maybeSingle();
    if (already) return;
    await sb.from('ar_activity').insert({ action, invoice_number: paymentIntentId, by_email: profile.email || 'field-collect' });
    await sb.from('job_closeout').upsert({ job_id: jobId, payment_disposition: 'paid_card', invoice_status: 'receipt_given', updated_by: profile.name || profile.email || 'field-collect', updated_at: new Date().toISOString() }, { onConflict: 'job_id' });
    // Reconcile to the job's OPEN invoice the same way the Stripe webhook does. Reader/keyed are raw
    // PaymentIntents the checkout.session webhook never sees, so we mark the invoice paid here, server-side,
    // after confirming the charge cleared. Best-effort — a job with no invoice row just records to AR/closeout.
    try {
      const { data: inv } = await sb.from('invoices').select('id, invoice_number, customer_id, balance').eq('job_id', String(jobId)).gt('balance', 0).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (inv) {
        const paid = Number(inv.balance) || 0;
        const u = await sb.from('invoices').update({ status: 'paid', balance: 0, paid_at: new Date().toISOString() }).eq('id', inv.id);
        if (u.error && /paid_at/.test(u.error.message || '')) await sb.from('invoices').update({ status: 'paid', balance: 0 }).eq('id', inv.id);
        try { await sb.from('ar_activity').insert({ action: 'customer_paid', invoice_id: inv.id, invoice_number: inv.invoice_number || null, customer_id: inv.customer_id || null, amount: paid, by_email: 'field-collect' }); } catch (_) {}
      }
    } catch (_) {}
    revalidatePath(`/job/${jobId}`);
  } catch (_) {}
}

// Same gate as createJobPayLink — a role that can change status or see financials may collect.
async function gateCollect() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false) return { err: 'Not signed in.' };
  if (!(can(profile.role, 'changeStatus') || can(profile.role, 'collectPayment') || can(profile.role, 'seeFinancials'))) return { err: 'Your role can’t collect payment.' };
  return { user, profile };
}

// Resolve which reader to charge: the tech's assigned reader → else the shop default → else the only
// online reader. Returns { id, label } or { err }.
async function resolveReader(sb, profile) {
  try {
    if (profile.tech_id) {
      const { data } = await sb.from('terminal_readers').select('id, label').eq('tech_id', profile.tech_id).limit(1).maybeSingle();
      if (data) return data;
    }
    const { data: def } = await sb.from('terminal_readers').select('id, label').eq('is_default', true).limit(1).maybeSingle();
    if (def) return def;
    const { data: any } = await sb.from('terminal_readers').select('id, label').limit(2);
    if (any && any.length === 1) return any[0];
    if (any && any.length > 1) return { err: 'No default reader set — pick one in Card Readers settings.' };
    return { err: 'No card reader paired yet — add one in Card Readers settings.' };
  } catch (e) {
    if (/relation|does not exist|schema cache/i.test(String(e && e.message))) return { err: 'Run migration 123_terminal_readers.sql first.' };
    return { err: 'Could not look up readers.' };
  }
}

// Suggested total for a job = accepted proposal total → else the job's amount (same logic as the pay-link).
async function suggestedDollars(sb, jobId, job) {
  let suggested = Number(job.amount) || 0;
  try {
    const { data: props } = await sb.from('proposals').select('accepted_total, created_at').eq('job_id', jobId).order('created_at', { ascending: false }).limit(3);
    const p = (props || []).find((x) => Number(x.accepted_total) > 0);
    if (p) suggested = Number(p.accepted_total);
  } catch (_) {}
  return suggested;
}

// START a reader charge for THIS job. Creates the PaymentIntent + pushes it to the reader; the customer
// taps on the reader. Returns { ok, paymentIntentId, totalDollars, baseDollars, feeDollars, readerLabel }.
export async function startReaderCharge(jobId, amountDollars) {
  const g = await gateCollect();
  if (g.err) return { ok: false, msg: g.err };
  if (!isStripeConfigured()) return { ok: false, msg: 'Stripe isn’t set up yet.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const { data: job } = await sb.from('jobs').select('id, customer_id, job_number, amount, customers(name)').eq('id', jobId).maybeSingle();
  if (!job) return { ok: false, msg: 'Job not found.' };

  const reader = await resolveReader(sb, g.profile);
  if (reader.err) return { ok: false, msg: reader.err };

  const dollars = Number(amountDollars) > 0 ? Number(amountDollars) : await suggestedDollars(sb, jobId, job);
  const cents = Math.round(dollars * 100);
  if (cents < 50) return { ok: false, msg: 'Enter an amount to collect.' };
  const name = (job.customers && job.customers.name) || '';

  const pi = await createCardPresentIntent({ amountCents: cents, invoiceNumber: job.job_number || null, customerName: name, invoiceId: null, customerId: job.customer_id });
  if (!pi.ok) return { ok: false, msg: 'Stripe: ' + pi.error };

  const pushed = await processIntentOnReader(reader.id, pi.id);
  if (!pushed.ok) return { ok: false, msg: 'Reader: ' + pushed.error };

  try { await sb.from('ar_activity').insert({ action: 'reader_charge_started', customer_id: job.customer_id || null, customer_name: name || null, invoice_number: job.job_number || null, amount: pi.totalCents / 100, by_email: g.profile.email || 'field-reader' }); } catch (_) {}

  return { ok: true, paymentIntentId: pi.id, readerId: reader.id, readerLabel: reader.label || 'reader', baseDollars: pi.baseCents / 100, feeDollars: pi.feeCents / 100, totalDollars: pi.totalCents / 100 };
}

// POLL the charge. When it settles, record AR + flip the job's payment disposition to paid_card so the
// close-out checklist reflects it. Returns { ok, status, paid, done }.
export async function pollReaderCharge(jobId, paymentIntentId) {
  const g = await gateCollect();
  if (g.err) return { ok: false, msg: g.err };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const s = await getCardPresentStatus(paymentIntentId);
  if (!s.ok) return { ok: false, msg: s.error };

  if (s.paid) {
    await recordPaidOnce(sb, jobId, g.profile, paymentIntentId, 'reader_charge_paid');
    return { ok: true, status: s.status, paid: true, done: true };
  }
  const failed = s.status === 'canceled';
  return { ok: true, status: s.status, paid: false, done: failed, lastError: s.lastError || null };
}

// Tech hit "Cancel" while the reader was waiting on a tap.
export async function cancelReaderCharge(readerId, paymentIntentId) {
  const g = await gateCollect();
  if (g.err) return { ok: false, msg: g.err };
  await cancelReaderAction(readerId, paymentIntentId);
  return { ok: true };
}

// ── KEYED entry (virtual terminal / MOTO) — fallback when no reader is available. Staff types the card by
// hand for a phone or in-hand payment. Card data goes straight to Stripe via Elements; never our server.

// START a keyed charge: make the MOTO PaymentIntent + return its client_secret for the client to confirm.
export async function startKeyedCharge(jobId, amountDollars) {
  const g = await gateCollect();
  if (g.err) return { ok: false, msg: g.err };
  if (!isStripeConfigured()) return { ok: false, msg: 'Stripe isn’t set up yet.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const { data: job } = await sb.from('jobs').select('id, customer_id, job_number, amount, customers(name)').eq('id', jobId).maybeSingle();
  if (!job) return { ok: false, msg: 'Job not found.' };

  const dollars = Number(amountDollars) > 0 ? Number(amountDollars) : await suggestedDollars(sb, jobId, job);
  const cents = Math.round(dollars * 100);
  if (cents < 50) return { ok: false, msg: 'Enter an amount to collect.' };
  const name = (job.customers && job.customers.name) || '';

  const pi = await createKeyedCardIntent({ amountCents: cents, invoiceNumber: job.job_number || null, customerName: name, invoiceId: null, customerId: job.customer_id });
  if (!pi.ok) return { ok: false, msg: 'Stripe: ' + pi.error };

  try { await sb.from('ar_activity').insert({ action: 'keyed_charge_started', customer_id: job.customer_id || null, customer_name: name || null, invoice_number: job.job_number || null, amount: pi.totalCents / 100, by_email: g.profile.email || 'field-keyed' }); } catch (_) {}

  return { ok: true, clientSecret: pi.clientSecret, paymentIntentId: pi.id, baseDollars: pi.baseCents / 100, feeDollars: pi.feeCents / 100, totalDollars: pi.totalCents / 100 };
}

// ── ACH (bank transfer) — LAST RESORT. No card fee, but settles in ~4 business days and can return/bounce.
// Bank-based, so there's no swipe/keypad: it's a hosted link the customer completes by connecting their bank.
export async function createJobAchLink(jobId, amountDollars) {
  const g = await gateCollect();
  if (g.err) return { ok: false, msg: g.err };
  if (!isStripeConfigured()) return { ok: false, msg: 'Stripe isn’t set up yet.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const { data: job } = await sb.from('jobs').select('id, customer_id, job_number, amount, customers(name)').eq('id', jobId).maybeSingle();
  if (!job) return { ok: false, msg: 'Job not found.' };

  const dollars = Number(amountDollars) > 0 ? Number(amountDollars) : await suggestedDollars(sb, jobId, job);
  const cents = Math.round(dollars * 100);
  if (cents < 50) return { ok: false, msg: 'Enter an amount to collect.' };
  const name = (job.customers && job.customers.name) || '';

  // Tie the bank link to the job's OPEN invoice so the webhook (async_payment_succeeded) marks THAT invoice
  // paid once the ACH clears — same reconciliation as the card pay-link. Best-effort.
  let invId = null, invNo = job.job_number || null;
  try { const { data: inv } = await sb.from('invoices').select('id, invoice_number').eq('job_id', String(jobId)).gt('balance', 0).order('created_at', { ascending: false }).limit(1).maybeSingle(); if (inv) { invId = inv.id; invNo = inv.invoice_number || invNo; } } catch (_) {}
  const r = await createInvoiceCheckout({ amountCents: cents, invoiceNumber: invNo, customerName: name, invoiceId: invId, customerId: job.customer_id, method: 'ach' });
  if (!r.ok) return { ok: false, msg: 'Stripe: ' + r.error };

  try { await sb.from('ar_activity').insert({ action: 'ach_link_created', customer_id: job.customer_id || null, customer_name: name || null, invoice_number: invNo, amount: (r.totalCents || cents) / 100, by_email: g.profile.email || 'field-ach' }); } catch (_) {}

  return { ok: true, url: r.url, baseDollars: (r.baseCents || cents) / 100, feeDollars: 0, totalDollars: (r.totalCents || cents) / 100, ach: true };
}

// CONFIRM a keyed charge AFTER the client confirms with Stripe — re-check status server-side (don't trust
// the client) and record + flip disposition. Returns { ok, paid }.
export async function confirmKeyedCharge(jobId, paymentIntentId) {
  const g = await gateCollect();
  if (g.err) return { ok: false, msg: g.err };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const s = await getCardPresentStatus(paymentIntentId); // status check is method-agnostic (retrieves the PI)
  if (!s.ok) return { ok: false, msg: s.error };
  if (s.paid) { await recordPaidOnce(sb, jobId, g.profile, paymentIntentId, 'keyed_charge_paid'); return { ok: true, paid: true }; }
  return { ok: true, paid: false, status: s.status, lastError: s.lastError || null };
}

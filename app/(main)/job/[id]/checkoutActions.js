'use server';

// In-person card-reader (WisePOS E) collection at job close-out — the "Collect now" half of the close-out
// checkout (the "Send link" half is createJobPayLink in my-day/actions). Server-driven: we push a
// card_present PaymentIntent to a reader, the customer taps, we poll until it settles. No card data here.
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import {
  isStripeConfigured, createCardPresentIntent, processIntentOnReader,
  getCardPresentStatus, cancelReaderAction, createInvoiceCheckout,
} from '@/lib/stripe';
import { revalidatePath } from 'next/cache';
import { canViewJob } from './jobAccess';
import { applyPayment } from '@/lib/invoiceBalance';
import { sendOne, renderEmailHtml, isEmailConfigured } from '@/lib/email';
import { sendSms, smsConfigured } from '@/lib/twilio';
import { postToDiscord } from '@/lib/discord';

const money2 = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 📧 Auto-send a PAID receipt to the customer after an in-person payment. Best-effort (never blocks/​fails the
// payment): emails the customer + their 2nd email on file + any extra email the tech typed, and texts if they've
// consented. This is a transactional receipt for a payment they just made — set to auto-send by the office.
async function sendPaymentReceipt(sb, { job, method, paidDollars, balanceDollars = 0, extraEmail = '' }) {
  try {
    let cust = {};
    if (job.customer_id) {
      try { const { data } = await sb.from('customers').select('name, email, email2, phone, phones, sms_consent').eq('id', job.customer_id).maybeSingle(); cust = data || {}; }
      catch (_) { try { const { data } = await sb.from('customers').select('name, email, phone, sms_consent').eq('id', job.customer_id).maybeSingle(); cust = data || {}; } catch (_2) {} }
    }
    const name = cust.name || (job.customers && job.customers.name) || 'there';
    const first = String(name).trim().split(/\s+/)[0] || name;
    const methodLabel = method === 'check' ? 'check' : method === 'cash' ? 'cash' : 'card';
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const emails = [...new Set([cust.email, cust.email2, extraEmail].map((e) => String(e || '').trim().toLowerCase()).filter((e) => /.+@.+\..+/.test(e)))];
    if (emails.length && isEmailConfigured) {
      const balanceNote = balanceDollars > 0 ? `Remaining balance on this job: ${money2(balanceDollars)}.` : 'Your balance is now paid in full. Thank you!';
      const body = `Hi ${first},\n\nThank you! This confirms we received ${money2(paidDollars)} by ${methodLabel}${job.job_number ? ` for job #${job.job_number}` : ''} on ${dateStr}.\n\n${balanceNote}`;
      await sendOne({ to: emails[0], cc: emails.slice(1).join(',') || undefined, subject: 'Payment receipt — Clog Busterz Plumbing', html: renderEmailHtml({ subject: 'Payment receipt — Clog Busterz Plumbing', body }), meta: { customerId: job.customer_id, purpose: 'receipt', ref: job.job_number || null } });
    }
    const phone = cust.phone || (Array.isArray(cust.phones) ? cust.phones[0] : cust.phones) || '';
    if (phone && cust.sms_consent && smsConfigured()) {
      await sendSms(phone, `Clog Busterz: received your ${money2(paidDollars)} ${methodLabel} payment${job.job_number ? ` on job #${job.job_number}` : ''}. Thank you!${balanceDollars > 0 ? ` Balance left: ${money2(balanceDollars)}.` : ' Paid in full.'} Reply STOP to opt out.`);
    }
  } catch (_) { /* receipt is best-effort — never fail a payment over it */ }
}

// Ownership gate — closes the payment IDOR. A field tech may only collect on THEIR OWN job; office/crew/
// financials roles may collect on any. Loads the job WITH the tech fields canViewJob needs, then checks it.
// Returns { job } (with tech fields + customer name) or { err }.
async function gateJob(sb, g, jobId) {
  const { data: job } = await sb.from('jobs')
    .select('id, customer_id, job_number, amount, tech_id, tech_email, tech_name, customers(name), techs(name)')
    .eq('id', jobId).maybeSingle();
  if (!job) return { err: 'Job not found.' };
  if (!(await canViewJob(sb, g.user, g.profile, g.profile.role, job))) return { err: 'That job isn’t yours.' };
  // PAYMENT/AR is LEAD-tech-or-office only (audit P2-17): a 2nd/segment tech or helper may VIEW the job (photos
  // + receipts) but must NEVER collect payment or flip AR. A field role must be the LEAD tech on THIS job.
  const isOffice = can(g.profile.role, 'seeAllJobs') || can(g.profile.role, 'assignJobs');
  if (!isOffice) {
    const tid = g.profile.tech_id;
    const email = String(g.user.email || g.profile.email || '').trim().toLowerCase();
    const isLead = (tid && job.tech_id && String(job.tech_id) === String(tid)) || (email && String(job.tech_email || '').toLowerCase() === email);
    if (!isLead) return { err: 'Only the lead tech (or the office) can collect payment on this job.' };
  }
  return { job };
}

// Record a paid charge ONCE (idempotent on the PaymentIntent id) + flip the job's payment disposition to
// paid_card so the close-out checklist reflects it. Shared by the reader + keyed-entry flows.
async function recordPaidOnce(sb, jobId, profile, paymentIntentId, action, paidCents) {
  try {
    // ATOMIC CLAIM — the unique index (mig 141) rejects a duplicate/concurrent insert, so only the FIRST
    // caller gets past here. Closes the multi-tab/device reader-poll race that could double-post AR.
    // Pre-141 (no index): fall back to a best-effort duplicate check (matches old behavior).
    const claim = await sb.from('ar_activity').insert({ action, invoice_number: paymentIntentId, by_email: profile.email || 'field-collect' });
    if (claim.error) {
      if (/duplicate|unique|23505/i.test(claim.error.message || '')) return; // already recorded for this charge → stop
      const { data: dup } = await sb.from('ar_activity').select('id').eq('action', action).eq('invoice_number', paymentIntentId).limit(2);
      if ((dup || []).length > 1) return;
    }
    await sb.from('job_closeout').upsert({ job_id: jobId, payment_disposition: 'paid_card', invoice_status: 'receipt_given', updated_by: profile.name || profile.email || 'field-collect', updated_at: new Date().toISOString() }, { onConflict: 'job_id' });
    // Reconcile to the job's OPEN invoice the same way the Stripe webhook does. Reader/keyed are raw
    // PaymentIntents the checkout.session webhook never sees, so we mark the invoice paid here, server-side,
    // after confirming the charge cleared. Best-effort — a job with no invoice row just records to AR/closeout.
    try {
      const { data: inv } = await sb.from('invoices').select('id, invoice_number, customer_id, balance').eq('job_id', String(jobId)).gt('balance', 0).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (inv) {
        // SUBTRACT the actual charged amount — a partial/deposit reader charge reduces the balance, not zero it.
        // Atomic (audit P2-18): apply_invoice_delta locks the row so a concurrent card+cash can't lose an update.
        const balDollars = Number(inv.balance) || 0;
        const paidDollars = Number(paidCents) > 0 ? Number(paidCents) / 100 : balDollars;
        await applyPayment(sb, inv.id, paidDollars);
        try { await sb.from('ar_activity').insert({ action: 'customer_paid', invoice_id: inv.id, invoice_number: inv.invoice_number || null, customer_id: inv.customer_id || null, amount: paidDollars, by_email: 'field-collect' }); } catch (_) {}
      }
    } catch (e) { console.error(`[checkout] invoice reconcile FAILED for job ${jobId} (charge cleared, invoice may still show open):`, (e && e.message) || e); }
    revalidatePath(`/job/${jobId}`);
  } catch (_) {}
}

// Who may collect: a role that can change a job's status OR explicitly collect payment. NOT seeFinancials
// alone — a read-only Viewer has seeFinancials but must never move money (audit F7).
async function gateCollect() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false) return { err: 'Not signed in.' };
  if (!(can(profile.role, 'changeStatus') || can(profile.role, 'collectPayment'))) return { err: 'Your role can’t collect payment.' };
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
  // Prefer the OPEN invoice balance — it reflects partial payments already taken, so a blank amount field can't
  // re-charge a stale proposal/job total over what's actually still owed. Falls back to accepted proposal → job.
  try {
    const { data: inv } = await sb.from('invoices').select('balance').eq('job_id', String(jobId)).gt('balance', 0).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (inv && Number(inv.balance) > 0) return Number(inv.balance);
  } catch (_) {}
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

  const gj = await gateJob(sb, g, jobId);
  if (gj.err) return { ok: false, msg: gj.err };
  const job = gj.job;

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
  const gj = await gateJob(sb, g, jobId); // own-job gate before we can flip THIS job's closeout/AR
  if (gj.err) return { ok: false, msg: gj.err };

  const s = await getCardPresentStatus(paymentIntentId);
  if (!s.ok) return { ok: false, msg: s.error };

  if (s.paid) {
    await recordPaidOnce(sb, jobId, g.profile, paymentIntentId, 'reader_charge_paid', s.baseCents);
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

// (Key-in / MOTO removed by Devin — the reader is preferred; pay-link + ACH cover card-not-present.)

// ── ACH (bank transfer) — LAST RESORT. No card fee, but settles in ~4 business days and can return/bounce.
// Bank-based, so there's no swipe/keypad: it's a hosted link the customer completes by connecting their bank.
export async function createJobAchLink(jobId, amountDollars) {
  const g = await gateCollect();
  if (g.err) return { ok: false, msg: g.err };
  if (!isStripeConfigured()) return { ok: false, msg: 'Stripe isn’t set up yet.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const gj = await gateJob(sb, g, jobId);
  if (gj.err) return { ok: false, msg: gj.err };
  const job = gj.job;

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

// ── CASH / CHECK collected IN PERSON (no Stripe, no fee) ────────────────────────────────────────────────
// Records the payment, flips the close-out disposition (paid_cash / check), and reconciles the open invoice
// just like a card charge. CHECK requires the check number + the ID (driver's license) written on it, per CB
// policy. Cash is marked "pending turn-in" so the office tracks the drop.
export async function recordManualPayment(jobId, payload) {
  const g = await gateCollect();
  if (g.err) return { ok: false, msg: g.err };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const gj = await gateJob(sb, g, jobId);
  if (gj.err) return { ok: false, msg: gj.err };
  const job = gj.job;

  const p = payload || {};
  const method = p.method === 'check' ? 'check' : 'cash';
  const dollars = Number(p.amountDollars) > 0 ? Number(p.amountDollars) : await suggestedDollars(sb, jobId, job);
  if (!(dollars > 0)) return { ok: false, msg: 'Enter an amount.' };
  const checkNumber = String(p.checkNumber || '').trim().slice(0, 40);
  const idOnCheck = String(p.idOnCheck || '').trim().slice(0, 60);
  if (method === 'check' && (!checkNumber || !idOnCheck)) return { ok: false, msg: 'A check needs a check number and the ID written on it.' };

  // CASH requires a photo of the bills FANNED OUT — proof of what was actually collected (anti-skim). Store it
  // on the job as a cash_proof photo (office-visible, not customer-visible) before recording the payment.
  if (method === 'cash') {
    const m = String(p.cashPhoto || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!m) return { ok: false, msg: 'Snap a photo of the cash fanned out first.' };
    const mime = m[1]; const bytes = Buffer.from(m[2], 'base64');
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) return { ok: false, msg: 'Cash photo is too large or empty — retake it.' };
    const id = randomUUID();
    const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
    const path = `jobs/${jobId}/${new Date().toISOString().slice(0, 10)}/${id}-cash.${ext}`;
    const upPhoto = await sb.storage.from('job-photos').upload(path, bytes, { contentType: mime, upsert: false });
    if (upPhoto.error) return { ok: false, msg: 'Cash photo: ' + upPhoto.error.message };
    try { await sb.from('job_photos').insert({ id, job_id: jobId, storage_bucket: 'job-photos', storage_path: path, file_name: `cash.${ext}`, mime_type: mime, size_bytes: bytes.length, kind: 'cash_proof', caption: `Cash collected — $${dollars} (fanned)`, customer_visible: false, uploaded_by: g.user.id, uploaded_by_email: g.user.email, uploaded_by_name: g.profile.name || g.user.email }); } catch (_) {}
  }

  const row = { job_id: jobId, payment_disposition: method === 'cash' ? 'paid_cash' : 'check', invoice_status: 'receipt_given', updated_by: g.profile.name || g.profile.email || 'field-collect', updated_at: new Date().toISOString() };
  if (method === 'cash') row.cash_status = 'pending';                          // needs turning in to the office
  if (method === 'check') { row.check_number = checkNumber; row.check_id = idOnCheck; }
  let up = await sb.from('job_closeout').upsert(row, { onConflict: 'job_id' });
  // Pre-155 (no check columns) → retry without them so collection still records.
  if (up.error && /check_number|check_id/i.test(up.error.message || '')) { const { check_number, check_id, ...lite } = row; up = await sb.from('job_closeout').upsert(lite, { onConflict: 'job_id' }); }
  if (up.error) return { ok: false, msg: up.error.message };

  // Reconcile the open invoice (subtract the amount), same as the card flow.
  let balanceDollars = 0;
  try {
    const { data: inv } = await sb.from('invoices').select('id, invoice_number, customer_id, balance').eq('job_id', String(jobId)).gt('balance', 0).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (inv) {
      // Atomic (audit P2-18) — same row-locking apply as the card path, so a concurrent cash+card can't lose an update.
      const ap = await applyPayment(sb, inv.id, dollars);
      balanceDollars = Number(ap?.balance) || 0;
      try { await sb.from('ar_activity').insert({ action: 'customer_paid', invoice_id: inv.id, invoice_number: inv.invoice_number || null, customer_id: inv.customer_id || null, amount: dollars, by_email: g.profile.email || 'field-collect' }); } catch (_) {}
    }
  } catch (_) {}

  const name = (job.customers && job.customers.name) || '';
  try { await sb.from('ar_activity').insert({ action: method === 'cash' ? 'cash_collected' : 'check_collected', customer_id: job.customer_id || null, customer_name: name || null, invoice_number: method === 'check' ? `check #${checkNumber}` : (job.job_number || null), amount: dollars, by_email: g.profile.email || 'field-collect' }); } catch (_) {}
  // 📧 Auto-send the customer a paid receipt (email on file + 2nd email + any extra the tech typed; text if opted in).
  await sendPaymentReceipt(sb, { job, method, paidDollars: dollars, balanceDollars, extraEmail: String(p.extraEmail || '') });
  revalidatePath(`/job/${jobId}`);
  return { ok: true, method, totalDollars: dollars, balanceDollars, checkNumber: method === 'check' ? checkNumber : null };
}

// 💳 FINANCING — placeholder until a financing provider is integrated. The tech taps it and the OFFICE runs the
// financing (their words), so this just flags the office (Discord ping + AR activity + audit) that this customer
// wants financing on this job. Nothing is charged; the office sets it up and reaches out to the customer.
export async function requestFinancing(jobId, opts = {}) {
  const g = await gateCollect();
  if (g.err) return { ok: false, msg: g.err };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const gj = await gateJob(sb, g, jobId);
  if (gj.err) return { ok: false, msg: gj.err };
  const job = gj.job;
  const amt = Math.max(0, Number(opts.amountDollars) || 0);
  const name = (job.customers && job.customers.name) || 'Customer';
  try { await postToDiscord(`💳 **Financing requested** — ${name}${job.job_number ? ` · job #${job.job_number}` : ''}${amt ? ` for $${amt.toLocaleString()}` : ''} wants financing. Run it from the office + reach out to the customer.`, { to: 'office' }); } catch (_) {}
  try { await sb.from('ar_activity').insert({ action: 'financing_requested', customer_id: job.customer_id || null, customer_name: name, invoice_number: job.job_number || null, amount: amt || null, by_email: g.profile.email || 'field' }); } catch (_) {}
  try { await sb.from('audit_log').insert({ actor_id: g.user.id, actor_name: g.profile.name || g.user.email, role: g.profile.role, action: 'financing.requested', entity: 'job', entity_id: String(jobId), detail: { amount: amt } }); } catch (_) {}
  return { ok: true, msg: 'Sent to the office — they’ll set up financing and reach out to the customer.' };
}

// 📅 NET-30 — don't collect now; the OFFICE bills the customer, due in 30 days. Sets the invoice's due date +30
// and leaves it OPEN (so it rides the AR aging the office watches), flags the closeout as net-30, and pings the
// office. Nothing is charged. This is the per-job version of a "bill from office" customer.
export async function billNet30(jobId, opts = {}) {
  const g = await gateCollect();
  if (g.err) return { ok: false, msg: g.err };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const gj = await gateJob(sb, g, jobId);
  if (gj.err) return { ok: false, msg: gj.err };
  const job = gj.job;
  const days = Math.max(1, Math.min(120, Number(opts.days) || 30));
  const due = new Date(); due.setDate(due.getDate() + days);
  const dueISO = due.toISOString().slice(0, 10);
  let inv = null;
  try { const { data } = await sb.from('invoices').select('id, invoice_number, balance').eq('job_id', String(jobId)).order('created_at', { ascending: false }).limit(1).maybeSingle(); inv = data || null; } catch (_) {}
  if (inv) { let u = await sb.from('invoices').update({ status: 'open', due_date: dueISO }).eq('id', inv.id); if (u.error && /due_date|column/i.test(u.error.message || '')) await sb.from('invoices').update({ status: 'open' }).eq('id', inv.id); }
  try { await sb.from('job_closeout').upsert({ job_id: jobId, payment_disposition: 'net_30', invoice_status: 'billed', updated_by: g.profile.name || g.profile.email || 'field', updated_at: new Date().toISOString() }, { onConflict: 'job_id' }); } catch (_) {}
  const name = (job.customers && job.customers.name) || 'Customer';
  try { await postToDiscord(`📅 **Net-${days} billed** — ${name}${job.job_number ? ` · job #${job.job_number}` : ''}. Office invoices; **due ${dueISO}**. Riding AR until paid — remind + collect.`, { to: 'office' }); } catch (_) {}
  try { await sb.from('ar_activity').insert({ action: 'net_30_billed', customer_id: job.customer_id || null, customer_name: name, invoice_number: inv?.invoice_number || job.job_number || null, amount: (inv?.balance != null ? Number(inv.balance) : Math.max(0, Number(opts.amountDollars) || 0)) || null, by_email: g.profile.email || 'field' }); } catch (_) {}
  try { await sb.from('audit_log').insert({ actor_id: g.user.id, actor_name: g.profile.name || g.user.email, role: g.profile.role, action: 'invoice.net30', entity: 'job', entity_id: String(jobId), detail: { due: dueISO, days } }); } catch (_) {}
  revalidatePath(`/job/${jobId}`);
  return { ok: true, dueDate: dueISO, days, msg: `Billed Net-${days} — due ${due.toLocaleDateString()}. The office collects; it’s tracked in AR.` };
}


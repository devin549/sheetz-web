'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { normalizeEta } from '@/lib/eta';
import { closeoutReason } from '@/lib/qa';
import { createInvoiceCheckout, isStripeConfigured } from '@/lib/stripe';
import { revalidatePath } from 'next/cache';

// Field tech (or office) generates a Stripe pay link for a job — bills the amount + 4% card fee. The tech
// texts it to the customer right from the job; the webhook reconciles + drops a 💳 note on the Comms Desk.
export async function createJobPayLink(jobId, amountDollars) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false || !(can(profile.role, 'changeStatus') || can(profile.role, 'seeFinancials'))) return { ok: false, msg: 'Your role can’t collect payment.' };
  if (!isStripeConfigured()) return { ok: false, msg: 'Stripe isn’t set up yet.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const { data: job } = await sb.from('jobs').select('id, customer_id, job_number, job_type, amount, customers(name)').eq('id', jobId).maybeSingle();
  if (!job) return { ok: false, msg: 'Job not found.' };
  // Suggested total = what the tech priced on this job (accepted proposal) → else the job's amount.
  let suggested = Number(job.amount) || 0;
  try {
    const { data: props } = await sb.from('proposals').select('accepted_total, status, created_at').eq('job_id', jobId).order('created_at', { ascending: false }).limit(3);
    const p = (props || []).find((x) => Number(x.accepted_total) > 0);
    if (p) suggested = Number(p.accepted_total);
  } catch (_) {}
  const dollars = Number(amountDollars) > 0 ? Number(amountDollars) : suggested;
  const cents = Math.round(dollars * 100);
  if (cents < 50) return { ok: false, msg: 'Enter an amount to collect.' };
  const name = (job.customers && job.customers.name) || '';
  // Tie the pay-link to the job's OPEN invoice (auto-created from the approved estimate) so the Stripe webhook
  // marks THAT invoice paid → balance 0. Best-effort; falls back to a job-number link if no invoice row yet.
  let invId = null, invNo = job.job_number || null;
  try { const { data: inv } = await sb.from('invoices').select('id, invoice_number').eq('job_id', String(jobId)).gt('balance', 0).order('created_at', { ascending: false }).limit(1).maybeSingle(); if (inv) { invId = inv.id; invNo = inv.invoice_number || invNo; } } catch (_) {}
  const r = await createInvoiceCheckout({ amountCents: cents, invoiceNumber: invNo, customerName: name, invoiceId: invId, customerId: job.customer_id });
  if (!r.ok) return { ok: false, msg: 'Stripe: ' + r.error };
  try { await sb.from('ar_activity').insert({ action: 'pay_link_created', customer_id: job.customer_id || null, customer_name: name || null, invoice_number: invNo, amount: cents / 100, by_email: 'field-paylink' }); } catch (_) {}
  return { ok: true, url: r.url, baseDollars: (r.baseCents || cents) / 100, feeDollars: (r.feeCents || 0) / 100, totalDollars: (r.totalCents || cents) / 100 };
}

// My Day "Find a job, invoice, or receipt by number…" box (HTML cbTechIpad_search). Searches by job
// number or customer name. SERVER-SCOPED: a field-only tech finds only their OWN jobs; office finds all.
export async function searchMyJobs(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return { ok: true, results: [] };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile) return { ok: false, results: [] };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, results: [] };
  const ownOnly = !can(profile.role, 'seeAllJobs') && can(profile.role, 'seeOwnOnly');
  if (ownOnly && !profile.tech_id) return { ok: true, results: [] }; // own-only with no roster link → nothing to scope
  const like = '%' + q.replace(/[%_,]/g, '') + '%';
  const seen = new Set(), results = [];
  const scope = (sel) => (ownOnly ? sel.eq('tech_id', profile.tech_id) : sel);
  const cols = 'id, job_number, job_type, status, scheduled_at, customer_id, customers(name)';
  const push = (rows) => { for (const j of (rows || [])) { if (seen.has(j.id) || results.length >= 8) continue; seen.add(j.id); results.push({ id: j.id, jobNumber: j.job_number || '', type: j.job_type || 'Service call', status: j.status || '', customer: (j.customers || {}).name || 'Customer', when: j.scheduled_at }); } };
  // By customer name (inner join so the filter applies to the joined table).
  try { const r = await scope(sb.from('jobs').select('id, job_number, job_type, status, scheduled_at, customer_id, customers!inner(name)').ilike('customers.name', like)).order('scheduled_at', { ascending: false }).limit(8); if (!r.error) push(r.data); } catch (_) {}
  // By job number — try text ilike; if the column is integer (ilike errors), exact-match a numeric query.
  try { const r = await scope(sb.from('jobs').select(cols).ilike('job_number', like)).order('scheduled_at', { ascending: false }).limit(8); if (r.error) throw r.error; push(r.data); }
  catch (_) { if (/^\d+$/.test(q)) { try { const r = await scope(sb.from('jobs').select(cols).eq('job_number', q)).limit(8); if (!r.error) push(r.data); } catch (_2) {} } }
  return { ok: true, results };
}

// Tech shares their live GPS from the field (My Day "Share location") → tech_locations, so Hank can
// route "closest tech for material/equipment" by true distance. Keyed to the signed-in tech's name.
export async function pingLocation(lat, lng, accuracy) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile) return { ok: false, msg: 'Not signed in.' };
  const la = Number(lat), ln = Number(lng);
  if (Number.isNaN(la) || Number.isNaN(ln)) return { ok: false, msg: 'No location fix.' };
  const name = profile.name || user.email;
  if (!name) return { ok: false, msg: 'Your account has no name — ask the office to set it on Team.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const row = { tech_name: name, tech_id: profile.tech_id || null, lat: la, lng: ln, accuracy_m: Number(accuracy) || null, source: 'web', updated_at: new Date().toISOString() };
  const { error } = await sb.from('tech_locations').upsert(row, { onConflict: 'tech_name' });
  if (error) return { ok: false, msg: /tech_locations|does not exist|schema cache/i.test(error.message) ? 'Run migration 60 first.' : error.message };
  return { ok: true, msg: 'Location shared with dispatch.' };
}

// Tech updates a job's status from the iPad in the field (Rolling/En route → On site → Complete).
// Stamps the matching timestamp. Gated to changeStatus (tech/helper-lead/foreman/office).
const VALID = ['scheduled', 'enroute', 'on_site', 'done'];
export async function updateMyJobStatus(jobId, status) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !can(profile.role, 'changeStatus')) return { ok: false, msg: 'Your role can’t update job status.' };
  if (!jobId || !VALID.includes(status)) return { ok: false, msg: 'Bad request.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  // Load the job once for the scope + close-gate checks.
  let { data: job } = await sb.from('jobs').select('id, tech_id, job_type, job_class, estimate_outcome').eq('id', jobId).maybeSingle();
  if (!job) { const r = await sb.from('jobs').select('id, tech_id, job_type').eq('id', jobId).maybeSingle(); job = r.data; } // pre-69 fallback
  if (!job) return { ok: false, msg: 'Job not found.' };
  // Scope: a field-only tech can only touch their OWN job — office/dispatch can touch any.
  if (!can(profile.role, 'seeAllJobs') && can(profile.role, 'seeOwnOnly')) {
    // An own-only role with no roster link can't be scoped to a job → deny (don't fall through).
    if (!profile.tech_id || String(job.tech_id) !== String(profile.tech_id)) return { ok: false, msg: 'That job isn’t assigned to you.' };
  }
  // Close-gate: a tech can't mark a job done until the closeout media rule is met (no override here —
  // overrides are a supervisor action). Fails open until the QA/photo tables are migrated.
  if (status === 'done' && !can(profile.role, 'qaOverride')) {
    const reason = await closeoutReason(sb, job);
    if (reason) return { ok: false, msg: reason, blocked: 'closeout' };
  }
  const patch = { status };
  const nowISO = new Date().toISOString();
  if (status === 'enroute') patch.enroute_at = nowISO;
  if (status === 'on_site') patch.started_at = nowISO;
  if (status === 'done') patch.completed_at = nowISO;
  const { error } = await sb.from('jobs').update(patch).eq('id', jobId);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/my-day');
  return { ok: true };
}

// Tech reports a delay from the field. Writes a STRUCTURED EVENT only — it never touches the
// customer. The office sees it on the board and controls any customer message (the no-auto-send rule).
export async function reportEta(jobId, minutes, note, needsHelp, newEtaISO) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !can(profile.role, 'changeStatus')) return { ok: false, msg: 'Your role can’t report ETA.' };
  if (!jobId) return { ok: false, msg: 'No job specified.' };
  // No zero-minute noise, require a reason (see lib/eta rules — the bad case was a needs_help with no note
  // + no minutes the office couldn't act on).
  const v = normalizeEta({ minutes, note, needsHelp });
  if (!v.ok) return v;
  const mins = v.mins, reason = v.reason;
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const { data: job } = await sb.from('jobs').select('id, tech_id').eq('id', jobId).maybeSingle();
  if (!job) return { ok: false, msg: 'Job not found.' };
  if (!can(profile.role, 'seeAllJobs') && can(profile.role, 'seeOwnOnly')) {
    // An own-only role with no roster link can't be scoped to a job → deny (don't fall through).
    if (!profile.tech_id || String(job.tech_id) !== String(profile.tech_id)) return { ok: false, msg: 'That job isn’t assigned to you.' };
  }

  const newEta = newEtaISO && !Number.isNaN(Date.parse(newEtaISO)) ? new Date(newEtaISO).toISOString() : null;
  const fields = { minutes: mins, note: reason, needs_help: !!needsHelp, new_eta: newEta, created_by: user.id, created_by_name: profile.name || user.email };
  // No duplicate spam: keep ONE OPEN (unacked) update per job. If the tech already has an open update on
  // this job, REVISE it (latest minutes/reason wins) instead of stacking another row the office has to
  // wade through and the customer gets re-pinged for. A fresh report only starts once the office acks.
  let existingId = null;
  try {
    const { data: open } = await sb.from('job_eta_updates').select('id').eq('job_id', String(jobId)).is('ack_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
    existingId = open?.id || null;
  } catch (_) {}
  let error;
  if (existingId) {
    ({ error } = await sb.from('job_eta_updates').update({ ...fields, created_at: new Date().toISOString() }).eq('id', existingId));
  } else {
    ({ error } = await sb.from('job_eta_updates').insert({ job_id: String(jobId), ...fields }));
  }
  if (error) return { ok: false, msg: error.message };
  try {
    await sb.from('audit_log').insert({
      actor_id: user.id, actor_name: profile.name || user.email, role: profile.role,
      action: 'eta.report', entity: 'job', entity_id: String(jobId), detail: { minutes: mins, needs_help: !!needsHelp },
    });
  } catch (_) {}
  revalidatePath('/my-day');
  revalidatePath('/board');
  return { ok: true, msg: needsHelp ? 'Office pinged for help.' : `Reported +${mins} min to the office.` };
}

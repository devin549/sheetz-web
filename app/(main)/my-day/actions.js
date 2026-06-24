'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
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
  const dollars = Number(amountDollars) > 0 ? Number(amountDollars) : Number(job.amount) || 0;
  const cents = Math.round(dollars * 100);
  if (cents < 50) return { ok: false, msg: 'Enter an amount to collect.' };
  const name = (job.customers && job.customers.name) || '';
  const r = await createInvoiceCheckout({ amountCents: cents, invoiceNumber: job.job_number || null, customerName: name, invoiceId: null, customerId: job.customer_id });
  if (!r.ok) return { ok: false, msg: 'Stripe: ' + r.error };
  try { await sb.from('ar_activity').insert({ action: 'pay_link_created', customer_id: job.customer_id || null, customer_name: name || null, invoice_number: job.job_number || null, amount: cents / 100, by_email: 'field-paylink' }); } catch (_) {}
  return { ok: true, url: r.url, baseDollars: (r.baseCents || cents) / 100, feeDollars: (r.feeCents || 0) / 100, totalDollars: (r.totalCents || cents) / 100 };
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
  const { data: job } = await sb.from('jobs').select('id, tech_id, job_type').eq('id', jobId).maybeSingle();
  if (!job) return { ok: false, msg: 'Job not found.' };
  // Scope: a field-only tech can only touch their OWN job — office/dispatch can touch any.
  if (!can(profile.role, 'seeAllJobs') && can(profile.role, 'seeOwnOnly') && profile.tech_id) {
    if (String(job.tech_id) !== String(profile.tech_id)) return { ok: false, msg: 'That job isn’t assigned to you.' };
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
  const mins = Math.max(0, Math.min(480, Math.round(Number(minutes) || 0)));
  if (!jobId || (!mins && !needsHelp)) return { ok: false, msg: 'Pick how late (or ask for office help).' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const { data: job } = await sb.from('jobs').select('id, tech_id').eq('id', jobId).maybeSingle();
  if (!job) return { ok: false, msg: 'Job not found.' };
  if (!can(profile.role, 'seeAllJobs') && can(profile.role, 'seeOwnOnly') && profile.tech_id) {
    if (String(job.tech_id) !== String(profile.tech_id)) return { ok: false, msg: 'That job isn’t assigned to you.' };
  }

  const newEta = newEtaISO && !Number.isNaN(Date.parse(newEtaISO)) ? new Date(newEtaISO).toISOString() : null;
  const { error } = await sb.from('job_eta_updates').insert({
    job_id: String(jobId), minutes: mins, note: String(note || '').slice(0, 400) || null,
    needs_help: !!needsHelp, new_eta: newEta, created_by: user.id, created_by_name: profile.name || user.email,
  });
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

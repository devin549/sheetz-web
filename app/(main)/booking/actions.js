'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

async function assertBooker() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !can(profile.role, 'createJobs')) throw new Error('Your role can’t book jobs.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return { sb, user, profile };
}
const clean = (v, n = 200) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

// Type-ahead against the 13k customer base — name OR phone.
export async function searchCustomersForBooking(q) {
  let sb;
  try { ({ sb } = await assertBooker()); } catch { return []; }
  const term = clean(q, 60);
  if (term.length < 2) return [];
  const { data, error } = await sb.from('customers')
    .select('id, name, phone, address')
    .or(`name.ilike.%${term}%,phone.ilike.%${term}%`)
    .order('lifetime_revenue', { ascending: false, nullsFirst: false })
    .limit(8);
  if (error) return [];
  return (data || []).map((c) => ({ id: c.id, name: c.name || 'Customer', phone: c.phone || '', address: c.address || '' }));
}

// Dispatcher Co-Pilot: history, value, balance + red flags for a picked customer (before you book).
export async function customerSnapshot(id) {
  let sb;
  try { ({ sb } = await assertBooker()); } catch { return null; }
  if (!id) return null;
  const { data: c } = await sb.from('customers')
    .select('name, phone, email, address, lifetime_revenue, lifetime_jobs, last_job_completed, do_not_service, do_not_mail, type')
    .eq('id', id).maybeSingle();
  if (!c) return null;
  let openBalance = 0;
  try {
    const { data: inv } = await sb.from('invoices').select('balance, status').eq('customer_id', id).eq('status', 'open').limit(200);
    openBalance = (inv || []).reduce((s, i) => s + (Number(i.balance) || 0), 0);
  } catch (_) { openBalance = 0; }
  return {
    name: c.name || 'Customer', phone: c.phone || '', email: c.email || '', address: c.address || '',
    lifetimeRevenue: Number(c.lifetime_revenue) || 0, lifetimeJobs: Number(c.lifetime_jobs) || 0,
    lastJob: c.last_job_completed || null, openBalance, doNotService: !!c.do_not_service, doNotMail: !!c.do_not_mail, type: c.type || '',
  };
}

// Create a booking: find-or-create the customer, then insert the job (status scheduled).
export async function createBooking(formData) {
  let ctx;
  try { ctx = await assertBooker(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const { sb } = ctx;

  let customerId = clean(formData.get('customerId'), 80) || null;
  const newName = clean(formData.get('newName'), 120);
  const newPhone = clean(formData.get('newPhone'), 40);
  const newAddress = clean(formData.get('newAddress'), 200);
  const customerEmail = clean(formData.get('customerEmail'), 160).toLowerCase();
  const jobType = clean(formData.get('jobType'), 120);
  const jobClass = clean(formData.get('jobClass'), 40) || null;
  const scheduledISO = clean(formData.get('scheduledISO'), 40);
  const durationMin = Math.max(15, Math.min(720, parseInt(formData.get('durationMin'), 10) || 60));
  const techId = clean(formData.get('techId'), 80) || null;
  const priority = ['normal', 'urgent', 'emergency'].includes(formData.get('priority')) ? formData.get('priority') : 'normal';
  const amount = Math.max(0, Number(formData.get('amount')) || 0);
  const address = clean(formData.get('address'), 200) || newAddress;
  const city = clean(formData.get('city'), 80) || null;
  const state = clean(formData.get('state'), 8) || null;
  const zip = clean(formData.get('zip'), 12) || null;
  const arrivalWindow = clean(formData.get('arrivalWindow'), 60) || null;
  const businessUnit = clean(formData.get('businessUnit'), 60) || null;
  const poNumber = clean(formData.get('poNumber'), 60) || null;
  const claimNumber = clean(formData.get('claimNumber'), 60) || null;
  const warrantyProvider = clean(formData.get('warrantyProvider'), 80) || null;
  const howHeard = clean(formData.get('howHeard'), 80) || null;
  const referralCode = clean(formData.get('referralCode'), 60) || null;
  const contacts = clean(formData.get('contacts'), 400);
  let notes = clean(formData.get('notes'), 1000);
  if (contacts) notes = (notes ? notes + '\n' : '') + 'Other contacts: ' + contacts;
  const serviceConsent = formData.get('serviceConsent') === 'on' || formData.get('serviceConsent') === 'true';
  const marketingConsent = formData.get('marketingConsent') === 'on' || formData.get('marketingConsent') === 'true';

  if (!jobType) return { ok: false, msg: 'What’s the job? (service type)' };
  if (scheduledISO && Number.isNaN(Date.parse(scheduledISO))) return { ok: false, msg: 'Bad date/time.' };

  // create the customer if this is a new one
  if (!customerId) {
    if (!newName) return { ok: false, msg: 'Pick a customer or enter a new name.' };
    const { data: created, error: cErr } = await sb.from('customers')
      .insert({ name: newName, phone: newPhone || null, address: newAddress || null, email: customerEmail || null })
      .select('id').single();
    if (cErr) return { ok: false, msg: 'Customer: ' + cErr.message };
    customerId = created.id;
  }

  // capture consent + email on the customer (we never auto-send — this records permission).
  const consentPatch = { sms_consent: serviceConsent, marketing_consent: marketingConsent, consent_source: 'web_booking', consent_ts: new Date().toISOString() };
  if (customerEmail) consentPatch.email = customerEmail;
  let cu = await sb.from('customers').update(consentPatch).eq('id', customerId);
  if (cu.error && /marketing_consent|column|schema cache/i.test(cu.error.message || '')) {
    delete consentPatch.marketing_consent; // pre-39 fallback
    await sb.from('customers').update(consentPatch).eq('id', customerId);
  }

  let techName = null;
  if (techId) { const { data: t } = await sb.from('techs').select('name').eq('id', techId).maybeSingle(); techName = (t && t.name) || null; }

  const base = {
    customer_id: customerId, status: 'scheduled', job_type: jobType, priority,
    scheduled_at: scheduledISO || null, duration_min: durationMin, amount,
    tech_id: techId, tech_name: techName, assigned_at: techId ? new Date().toISOString() : null,
    address: address || null, city, business_unit: businessUnit,
  };
  const extra = { notes: notes || null, job_class: jobClass, arrival_window: arrivalWindow, po_number: poNumber, claim_number: claimNumber, warranty_provider: warrantyProvider, how_heard: howHeard, referral_code: referralCode, state, zip };
  let ins = await sb.from('jobs').insert({ ...base, ...extra }).select('id').single();
  if (ins.error && /column|schema cache/i.test(ins.error.message || '')) {
    ins = await sb.from('jobs').insert(base).select('id').single(); // pre-39 fallback: book with the core fields
  }
  const job = ins.data; const jErr = ins.error;
  if (jErr) return { ok: false, msg: 'Job: ' + jErr.message };

  try {
    await sb.from('audit_log').insert({ actor_id: ctx.user.id, actor_name: ctx.profile.name || ctx.user.email, role: ctx.profile.role, action: 'job.book', entity: 'job', entity_id: String(job.id), detail: { jobType } });
  } catch (_) {}

  revalidatePath('/board');
  revalidatePath('/job-records');
  return { ok: true, msg: 'Job booked.', jobId: job.id };
}

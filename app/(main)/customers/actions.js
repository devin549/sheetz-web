'use server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canOverrideCreditHold } from '@/lib/creditHold';
import { can } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

const clean = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
const isEmail = (s) => !s || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s).trim());

// Set a customer's primary + SECONDARY email. The secondary is CC'd on every customer-facing email
// (estimate, statement, booking, reschedule) so they don't miss it. Office-gated + audited.
export async function setCustomerEmails(customerId, email, email2) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!(can(profile.role, 'assignJobs') || can(profile.role, 'manageUsers') || can(profile.role, 'seeCrew') || can(profile.role, 'createJobs') || can(profile.role, 'contactCustomer'))) return { ok: false, msg: 'Office only.' };
  const id = clean(customerId, 80);
  if (!id) return { ok: false, msg: 'No customer.' };
  const e1 = clean(email, 200), e2 = clean(email2, 200);
  if (!isEmail(e1)) return { ok: false, msg: 'Primary email looks invalid.' };
  if (!isEmail(e2)) return { ok: false, msg: 'Secondary email looks invalid.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  // Saving a fixed email clears any bounce flag (the office just corrected it).
  let { error } = await sb.from('customers').update({ email: e1 || null, email2: e2 || null, email_status: null, email_bounced_at: null }).eq('id', id);
  if (error && /email2|email_status|email_bounced_at|column|schema cache/i.test(error.message || '')) {
    let { error: e2err } = await sb.from('customers').update({ email: e1 || null, email2: e2 || null }).eq('id', id);
    if (e2err && /email2|column|schema cache/i.test(e2err.message || '')) { ({ error: e2err } = await sb.from('customers').update({ email: e1 || null }).eq('id', id)); if (!e2err) return { ok: false, msg: 'Primary saved — run supabase/157_customer_email2.sql to enable the secondary email.' }; }
    error = e2err;
  }
  if (error) return { ok: false, msg: error.message };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'customer.emails_set', entity: 'customer', entity_id: id, detail: { email: e1 || null, email2: e2 || null } }); } catch (_) {}
  revalidatePath(`/customers/${id}`);
  return { ok: true, msg: 'Emails saved.' };
}

// Place or lift a customer's credit hold. Owner / GM / accounting only (canOverrideCreditHold). A hold
// blocks new bookings for everyone below that tier — the "no new work without approved terms" guardrail.
export async function setCreditHold(customerId, on, reason) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!canOverrideCreditHold(profile.role)) return { ok: false, msg: 'Only owner / GM / accounting can change a credit hold.' };
  const id = clean(customerId, 80);
  if (!id) return { ok: false, msg: 'No customer.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const hold = !!on;
  const patch = hold
    ? { credit_hold: true, credit_hold_reason: clean(reason, 300) || 'Past-due balance', credit_hold_at: new Date().toISOString(), credit_hold_by: profile.name || user.email }
    : { credit_hold: false, credit_hold_reason: null, credit_hold_at: null, credit_hold_by: null };
  const { error } = await sb.from('customers').update(patch).eq('id', id);
  if (error) return { ok: false, msg: /credit_hold|column|schema cache/i.test(error.message || '') ? 'Run supabase/130_customer_credit_hold.sql first.' : error.message };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: hold ? 'customer.credit_hold_on' : 'customer.credit_hold_off', entity: 'customer', entity_id: id, detail: { reason: patch.credit_hold_reason || null } }); } catch (_) {}
  revalidatePath(`/customers/${id}`);
  return { ok: true, msg: hold ? 'Credit hold placed — new bookings now need owner/GM/accounting approval.' : 'Credit hold lifted.' };
}

// Set a customer's payment terms (Net-30/Net-15 for trusted/commercial accounts; 0 = due at close). Owner /
// GM / accounting only — it's a credit decision. When > 0 the close doesn't collect; the office invoices.
export async function setPaymentTerms(customerId, days) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!canOverrideCreditHold(profile.role)) return { ok: false, msg: 'Only owner / GM / accounting can set payment terms.' };
  const id = clean(customerId, 80);
  if (!id) return { ok: false, msg: 'No customer.' };
  const n = [0, 15, 30].includes(Number(days)) ? Number(days) : 0;
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const patch = { net_terms_days: n, net_terms_by: n ? (profile.name || user.email) : null, net_terms_at: n ? new Date().toISOString() : null };
  const { error } = await sb.from('customers').update(patch).eq('id', id);
  if (error) return { ok: false, msg: /net_terms|column|schema cache/i.test(error.message || '') ? 'Run supabase/132_customer_net_terms.sql first.' : error.message };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'customer.net_terms', entity: 'customer', entity_id: id, detail: { net_terms_days: n } }); } catch (_) {}
  revalidatePath(`/customers/${id}`);
  return { ok: true, msg: n ? `Set to Net-${n} — the close won't collect; the office invoices.` : 'Back to due-at-close.' };
}

// Set a customer's BILLING MODE in one shot: officeBills (the tech collects nothing; the office invoices) +
// the terms days (0 = due on receipt, 15/30 = net-N). Owner / GM / accounting only — it's a credit decision.
// "Tech collects at close" = officeBills:false + 0 days (residential default). Updates bill_from_office +
// net_terms_days together so the close-out + estimate stay consistent.
export async function setBilling(customerId, { officeBills, days } = {}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!canOverrideCreditHold(profile.role)) return { ok: false, msg: 'Only owner / GM / accounting can set billing.' };
  const id = clean(customerId, 80);
  if (!id) return { ok: false, msg: 'No customer.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const office = !!officeBills;
  const n = office && [0, 15, 30].includes(Number(days)) ? Number(days) : 0;
  const who = profile.name || user.email; const at = new Date().toISOString();
  const patch = {
    bill_from_office: office, bill_from_office_by: office ? who : null, bill_from_office_at: office ? at : null,
    net_terms_days: n, net_terms_by: n ? who : null, net_terms_at: n ? at : null,
  };
  const { error } = await sb.from('customers').update(patch).eq('id', id);
  if (error) {
    if (/bill_from_office/i.test(error.message || '')) return { ok: false, msg: 'Run supabase/135_customer_bill_from_office.sql first.' };
    if (/net_terms|column|schema cache/i.test(error.message || '')) return { ok: false, msg: 'Run supabase/132_customer_net_terms.sql first.' };
    return { ok: false, msg: error.message };
  }
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: who, role: profile.role, action: office ? 'customer.bill_from_office_on' : 'customer.bill_from_office_off', entity: 'customer', entity_id: id, detail: { net_terms_days: n } }); } catch (_) {}
  revalidatePath(`/customers/${id}`);
  return { ok: true, msg: office ? `Billed by the office${n ? ` · Net-${n}` : ' · due on receipt'} — techs collect nothing on site.` : 'Tech collects at the close (residential default).' };
}

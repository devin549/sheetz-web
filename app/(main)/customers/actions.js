'use server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { canOverrideCreditHold } from '@/lib/creditHold';
import { revalidatePath } from 'next/cache';

const clean = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);

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

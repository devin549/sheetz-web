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

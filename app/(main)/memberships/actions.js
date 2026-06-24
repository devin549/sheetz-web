'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';

// Roles that manage the membership book (office + revenue seats).
const MANAGE = ['owner', 'admin', 'gm', 'om', 'csr', 'dispatcher', 'accounting', 'sales', 'marketing'];
const STATUSES = ['active', 'paused', 'cancelled'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !MANAGE.includes(String(profile.role || '').toLowerCase())) return { ok: false, msg: 'Your role can’t manage memberships.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  return { ok: true, sb, who: profile.name || user.email };
}
const missing = (e) => /could not find|does not exist|schema cache/i.test(e?.message || '');

export async function createMembership(formData) {
  const g = await gate();
  if (!g.ok) return g;

  const customer = String(formData.get('customer') || '').trim().slice(0, 160);
  const customer_id = String(formData.get('customerId') || '').trim() || null;
  const plan = String(formData.get('plan') || '').trim().slice(0, 120);
  const period = formData.get('period') === 'month' ? 'month' : 'year';
  const price_cents = Math.max(0, Math.round((Number(formData.get('price')) || 0) * 100));
  const started_on = String(formData.get('started_on') || '').slice(0, 10) || null;
  const renews_on = String(formData.get('renews_on') || '').slice(0, 10) || null;
  const note = String(formData.get('note') || '').trim().slice(0, 500) || null;
  const billing_status = ['current', 'past_due', 'comp'].includes(formData.get('billing_status')) ? formData.get('billing_status') : 'current';
  const benefits = String(formData.get('benefits') || '').trim().slice(0, 300) || null;
  const discount_pct = formData.get('discount_pct') === '' || formData.get('discount_pct') == null ? null : Math.max(0, Math.min(100, Number(formData.get('discount_pct')) || 0));
  const next_service_due = String(formData.get('next_service_due') || '').slice(0, 10) || null;
  if (!customer || !plan) return { ok: false, msg: 'Customer and plan are required.' };

  const base = { customer, customer_id, plan, period, price_cents, note, status: 'active', created_by: g.who };
  if (started_on) base.started_on = started_on;
  if (renews_on) base.renews_on = renews_on;
  const extra = { billing_status, benefits, discount_pct, next_service_due };
  let ins = await g.sb.from('memberships').insert({ ...base, ...extra });
  if (ins.error && /column|schema cache/i.test(ins.error.message || '')) ins = await g.sb.from('memberships').insert(base); // pre-52
  if (ins.error) return { ok: false, msg: missing(ins.error) ? 'Run supabase/35_memberships.sql first.' : ins.error.message };
  revalidatePath('/memberships');
  return { ok: true, msg: `Enrolled ${customer} in ${plan}.` };
}

// Typeahead to link a membership to a customer record (phone-tolerant).
export async function searchMembershipCustomers(q) {
  const g = await gate();
  if (!g.ok) return [];
  const term = String(q || '').trim();
  if (term.length < 2) return [];
  const rpc = await g.sb.rpc('search_customers', { term });
  if (rpc.error) return [];
  return (rpc.data || []).slice(0, 8).map((c) => ({ id: c.id, name: c.name || 'Customer', phone: c.phone || '' }));
}

export async function setMembershipStatus(id, status) {
  const g = await gate();
  if (!g.ok) return g;
  if (!STATUSES.includes(status)) return { ok: false, msg: 'Bad status.' };
  const { error } = await g.sb.from('memberships').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/35_memberships.sql first.' : error.message };
  revalidatePath('/memberships');
  return { ok: true, msg: 'Updated.' };
}

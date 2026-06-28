'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { mergeCustomers } from '../past-due/actions';
import { revalidatePath } from 'next/cache';

// Gate: customer reconciliation moves money records around, so financial seats only.
async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false || !can(profile.role, 'seeFinancials')) return null;
  return { sb: getSupabaseAdmin(), who: user.email || '' };
}

const digits = (s) => String(s || '').replace(/\D/g, '').slice(-10);
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Placeholder/fake phones (1234567890, all-same, 555…) would group unrelated people — ignore them.
const FAKE_PHONES = new Set(['1234567890', '1234567891', '0000000000', '1111111111', '5555555555', '9999999999', '8888888888', '1112223333', '0123456789']);
const looksFake = (p) => FAKE_PHONES.has(p) || new Set(p.split('')).size <= 2;
const phoneOf = (c) => {
  const p = digits(c.phone) || (Array.isArray(c.phones) ? digits(c.phones[0]) : digits(c.phones));
  return (p.length === 10 && !looksFake(p)) ? p : '';
};

// Find likely-duplicate customers — the merge happens AFTER you import / soft-test, when a customer
// created natively (no ST id) is the same person as an imported ST record. Groups by shared phone
// (strongest) then exact normalized name. Returns candidate groups with a suggested keeper.
export async function findDuplicateCustomers() {
  const g = await gate();
  if (!g || !g.sb) return { ok: false, msg: 'Your role can’t reconcile customers.' };
  const sb = g.sb;

  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from('customers').select('id, name, phone, phones, address, st_customer_id, lifetime_revenue, created_at').range(from, from + 999);
    if (error) return { ok: false, msg: error.message };
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const byPhone = {}, byName = {};
  all.forEach((c) => {
    const p = phoneOf(c); if (p) (byPhone[p] = byPhone[p] || []).push(c);
    const n = normName(c.name); if (n.length >= 4) (byName[n] = byName[n] || []).push(c);
  });

  // Build groups — phone matches first (higher confidence), then name; skip a group already covered.
  const groups = []; const used = new Set();
  const add = (members, reason) => {
    if (members.length < 2) return;
    if (members.every((m) => used.has(m.id))) return;
    members.forEach((m) => used.add(m.id));
    groups.push({ reason, members });
  };
  Object.values(byPhone).filter((m) => m.length > 1).forEach((m) => add(m, 'same phone'));
  Object.values(byName).filter((m) => m.length > 1).forEach((m) => add(m, 'same name'));

  // Cap the review list; count invoices + jobs for the members we'll show (so you keep the real record).
  const capped = groups.slice(0, 120);
  const memberIds = capped.flatMap((gr) => gr.members.map((m) => m.id));
  const invCount = {}, jobCount = {};
  for (let i = 0; i < memberIds.length; i += 300) {
    const ids = memberIds.slice(i, i + 300);
    const { data: inv } = await sb.from('invoices').select('customer_id').in('customer_id', ids);
    (inv || []).forEach((r) => { invCount[r.customer_id] = (invCount[r.customer_id] || 0) + 1; });
    try { const { data: jb } = await sb.from('jobs').select('customer_id').in('customer_id', ids); (jb || []).forEach((r) => { jobCount[r.customer_id] = (jobCount[r.customer_id] || 0) + 1; }); } catch (_) {}
  }

  const score = (m) => (m.st_customer_id ? 1e9 : 0) + (invCount[m.id] || 0) * 1000 + (jobCount[m.id] || 0) * 1000 + (Number(m.lifetime_revenue) || 0);
  const out = capped.map((gr) => {
    const members = gr.members.map((m) => ({
      id: m.id, name: m.name, phone: m.phone || (Array.isArray(m.phones) ? m.phones[0] : m.phones) || '',
      st_customer_id: m.st_customer_id || null, lifetime_revenue: Number(m.lifetime_revenue) || 0,
      invoices: invCount[m.id] || 0, jobs: jobCount[m.id] || 0, created_at: m.created_at, address: m.address || '',
    })).sort((a, b) => score(b) - score(a));
    return { reason: gr.reason, keeperId: members[0].id, members };
  });

  return { ok: true, groups: out, totalCustomers: all.length, groupsFound: groups.length };
}

// Merge one duplicate into the keeper (moves invoices/jobs/collections/etc onto it, then removes the
// dupe) — reuses the audited mergeCustomers from past-due. Then refresh the reconcile view.
export async function mergeDuplicate(keepId, dupeId) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Your role can’t reconcile customers.' };
  const r = await mergeCustomers(keepId, dupeId);
  revalidatePath('/reconcile');
  return r;
}

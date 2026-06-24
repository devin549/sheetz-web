'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';

const MANAGE = ['owner', 'admin', 'gm', 'om', 'shop', 'accounting'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !MANAGE.includes(String(profile.role || '').toLowerCase())) return null;
  return { user, profile, sb: getSupabaseAdmin() };
}
const missing = (e) => /could not find|does not exist|schema cache/i.test(e?.message || '');
const clean = (v, n = 200) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

export async function createPO(formData) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Your role can’t create POs.' };
  if (!g.sb) return { ok: false, msg: 'Server not configured.' };

  const vendor_id = clean(formData.get('vendor_id'), 80) || null;
  const vendor_name = clean(formData.get('vendor_name'), 120);
  if (!vendor_name) return { ok: false, msg: 'Pick a vendor.' };
  let lines = [];
  try { lines = JSON.parse(String(formData.get('lines') || '[]')); } catch (_) { lines = []; }
  lines = (Array.isArray(lines) ? lines : []).map((l) => ({
    item: clean(l.item, 120), sku: clean(l.sku, 60) || null,
    qty: Math.max(0, Number(l.qty) || 0), unit_cost_cents: Math.round((Number(l.unit_cost) || 0) * 100),
  })).filter((l) => l.item);
  lines.forEach((l) => { l.line_total_cents = Math.round(l.qty * l.unit_cost_cents); });
  if (!lines.length) return { ok: false, msg: 'Add at least one line item.' };
  const total_cents = lines.reduce((s, l) => s + l.line_total_cents, 0);
  const po_number = 'PO-' + Date.now().toString(36).slice(-6).toUpperCase();

  const { data: po, error } = await g.sb.from('purchase_orders').insert({
    po_number, vendor_id, vendor_name, status: 'draft', total_cents,
    note: clean(formData.get('note'), 300) || null, created_by: g.profile.name || g.user.email,
  }).select('id').single();
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/47_vendors_pos.sql first.' : error.message };

  const { error: lErr } = await g.sb.from('po_lines').insert(lines.map((l) => ({ ...l, po_id: po.id })));
  if (lErr) return { ok: false, msg: 'Lines: ' + lErr.message };
  revalidatePath('/purchase-orders');
  return { ok: true, msg: `${po_number} created.` };
}

export async function setPOStatus(id, status) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Not allowed.' };
  if (!['draft', 'ordered', 'received'].includes(status)) return { ok: false, msg: 'Bad status.' };
  const patch = { status };
  if (status === 'ordered') patch.ordered_at = new Date().toISOString();
  if (status === 'received') patch.received_at = new Date().toISOString();
  const { error } = await g.sb.from('purchase_orders').update(patch).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/purchase-orders');
  return { ok: true, msg: `Marked ${status}.` };
}

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

export async function saveVendor(formData) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Your role can’t manage vendors.' };
  if (!g.sb) return { ok: false, msg: 'Server not configured.' };
  const id = clean(formData.get('id'), 80) || null;
  const name = clean(formData.get('name'), 120);
  if (!name) return { ok: false, msg: 'Vendor name?' };
  const row = {
    name, account_no: clean(formData.get('account_no'), 60) || null, rep: clean(formData.get('rep'), 80) || null,
    phone: clean(formData.get('phone'), 40) || null, email: clean(formData.get('email'), 120) || null,
    terms: clean(formData.get('terms'), 60) || null, note: clean(formData.get('note'), 300) || null,
  };
  const q = id ? g.sb.from('vendors').update(row).eq('id', id) : g.sb.from('vendors').insert(row);
  const { error } = await q;
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/47_vendors_pos.sql first.' : error.message };
  revalidatePath('/vendors');
  return { ok: true, msg: 'Saved.' };
}

export async function saveVendorPrice(formData) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Not allowed.' };
  const vendor_id = clean(formData.get('vendor_id'), 80) || null;
  const vendor_name = clean(formData.get('vendor_name'), 120);
  const item = clean(formData.get('item'), 120);
  if (!item) return { ok: false, msg: 'What item?' };
  const row = {
    vendor_id, vendor_name, item, sku: clean(formData.get('sku'), 60) || null,
    price_cents: Math.round((Number(formData.get('price')) || 0) * 100), unit: clean(formData.get('unit'), 12) || 'ea',
    updated_at: new Date().toISOString(), updated_by: g.profile.name || g.user.email,
  };
  const { error } = await g.sb.from('vendor_prices').insert(row);
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/47_vendors_pos.sql first.' : error.message };
  revalidatePath('/vendors');
  return { ok: true, msg: 'Price saved.' };
}

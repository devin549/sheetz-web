'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';

const MANAGE = ['owner', 'admin', 'gm', 'om', 'shop'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !MANAGE.includes(String(profile.role || '').toLowerCase())) return null;
  return { user, profile, sb: getSupabaseAdmin() };
}
const missing = (e) => /could not find|does not exist|schema cache/i.test(e?.message || '');
const clean = (v, n = 200) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

export async function saveStock(formData) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Your role can’t manage shop stock.' };
  if (!g.sb) return { ok: false, msg: 'Server not configured.' };
  const id = clean(formData.get('id'), 80) || null;
  const item = clean(formData.get('item'), 120);
  if (!item) return { ok: false, msg: 'What item?' };
  const row = {
    item, sku: clean(formData.get('sku'), 60) || null, bin: clean(formData.get('bin'), 40) || null,
    qty: Number(formData.get('qty')) || 0, min_qty: formData.get('min_qty') === '' ? null : (Number(formData.get('min_qty')) || 0),
    note: clean(formData.get('note'), 200) || null, updated_at: new Date().toISOString(), updated_by: g.profile.name || g.user.email,
  };
  const q = id ? g.sb.from('shop_stock').update(row).eq('id', id) : g.sb.from('shop_stock').insert(row);
  const { error } = await q;
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/49_shop_stock.sql first.' : error.message };
  revalidatePath('/slotting'); revalidatePath('/stock-map');
  return { ok: true, msg: 'Saved.' };
}

// Quick bin assignment (put-away).
export async function setBin(id, bin) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Not allowed.' };
  const { error } = await g.sb.from('shop_stock').update({ bin: clean(bin, 40) || null, updated_at: new Date().toISOString(), updated_by: g.profile.name || g.user.email }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/slotting'); revalidatePath('/stock-map');
  return { ok: true, msg: 'Binned.' };
}

'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';

const MANAGE = ['owner', 'admin', 'gm', 'om', 'shop', 'fs', 'foreman'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !MANAGE.includes(String(profile.role || '').toLowerCase())) return null;
  return { user, profile, sb: getSupabaseAdmin() };
}
const missing = (e) => /could not find|does not exist|schema cache/i.test(e?.message || '');
const clean = (v, n = 200) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

export async function addTool(formData) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Your role can’t manage tools.' };
  if (!g.sb) return { ok: false, msg: 'Server not configured.' };
  const name = clean(formData.get('name'), 120);
  if (!name) return { ok: false, msg: 'Tool name?' };
  const row = {
    name, serial: clean(formData.get('serial'), 80) || null, mfg: clean(formData.get('mfg'), 80) || null,
    year: parseInt(formData.get('year'), 10) || null, value: Math.max(0, Number(formData.get('value')) || 0),
    assigned_to: null, status: 'in_shop', shop_location: clean(formData.get('shop_location'), 40) || null,
  };
  let { error } = await g.sb.from('tools').insert(row);
  // shop_location is new (migration 59) — if the column isn't there yet, save without it.
  if (error && /shop_location/.test(error.message || '')) { delete row.shop_location; ({ error } = await g.sb.from('tools').insert(row)); }
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/05_truck_tools.sql first.' : error.message };
  revalidatePath('/tool-checkout');
  return { ok: true, msg: `Added ${name}.` };
}

export async function checkOutTool(id, tech) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Not allowed.' };
  const to = clean(tech, 80);
  if (!id || !to) return { ok: false, msg: 'Pick who it goes to.' };
  const { error } = await g.sb.from('tools').update({ assigned_to: to, status: 'on_van' }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/tool-checkout');
  return { ok: true, msg: `Checked out to ${to}.` };
}

export async function checkInTool(id, shop) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Not allowed.' };
  const upd = { assigned_to: null, status: 'in_shop' };
  const loc = clean(shop, 40);
  if (loc) upd.shop_location = loc;
  let { error } = await g.sb.from('tools').update(upd).eq('id', id);
  if (error && /shop_location/.test(error.message || '')) { delete upd.shop_location; ({ error } = await g.sb.from('tools').update(upd).eq('id', id)); }
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/tool-checkout');
  return { ok: true, msg: loc ? `Checked in to ${loc}.` : 'Checked back in.' };
}

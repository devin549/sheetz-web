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
const clean = (v, n = 200) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

export async function recordCount(formData) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Your role can’t reconcile inventory.' };
  if (!g.sb) return { ok: false, msg: 'Server not configured.' };
  const item = clean(formData.get('item'), 120);
  if (!item) return { ok: false, msg: 'What item?' };
  const system_qty = Number(formData.get('system_qty')) || 0;
  const counted_qty = Number(formData.get('counted_qty')) || 0;
  const row = {
    item, sku: clean(formData.get('sku'), 60) || null, location: clean(formData.get('location'), 80) || null,
    system_qty, counted_qty, variance: counted_qty - system_qty,
    note: clean(formData.get('note'), 300) || null, counted_by: g.profile.name || g.user.email,
  };
  const { error } = await g.sb.from('inventory_counts').insert(row);
  if (error) return { ok: false, msg: /schema cache|does not exist|could not find/i.test(error.message || '') ? 'Run supabase/48_inventory_counts.sql first.' : error.message };
  revalidatePath('/parts-recon');
  const v = row.variance;
  return { ok: true, msg: v === 0 ? 'Counted — matches system. ✓' : (v < 0 ? `Counted — SHORT ${Math.abs(v)}.` : `Counted — over by ${v}.`) };
}

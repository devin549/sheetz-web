'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';

const clean = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
const missing = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  return { user, profile: await loadProfile(user), sb: getSupabaseAdmin() };
}
// Whose van — a tech edits their own; a manager can pass ?tech via the form.
function vanTech(c, form) { return clean(form?.get?.('tech') || c.profile.name || c.user.email, 120); }

async function upsertMaint(c, tech, patch) {
  const { data: row } = await c.sb.from('van_maintenance').select('id').eq('tech_name', tech).maybeSingle();
  const base = { tech_name: tech, updated_at: new Date().toISOString(), ...patch };
  const res = row ? await c.sb.from('van_maintenance').update(base).eq('id', row.id) : await c.sb.from('van_maintenance').insert(base);
  if (res.error) return { err: missing(res.error) ? 'Run supabase/96_van_maintenance.sql first.' : res.error.message };
  return { ok: true };
}

// Update current mileage (typed or from an odometer scan).
export async function setMileage(form) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const miles = Math.max(0, Math.round(Number(form.get('mileage')) || 0));
  if (!miles) return { ok: false, msg: 'Enter the odometer reading.' };
  const r = await upsertMaint(c, vanTech(c, form), { current_mileage: miles });
  if (!r.err) revalidatePath('/my-truck');
  return r.err ? { ok: false, msg: r.err } : { ok: true };
}

// Mark oil changed — resets the next-due mark to the current mileage + logs it.
export async function markOilChanged(form) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const tech = vanTech(c, form);
  const { data: m } = await c.sb.from('van_maintenance').select('current_mileage').eq('tech_name', tech).maybeSingle();
  const miles = m?.current_mileage || Math.max(0, Math.round(Number(form.get('mileage')) || 0)) || null;
  const r = await upsertMaint(c, tech, { last_oil_mileage: miles, last_service_date: new Date().toISOString().slice(0, 10) });
  if (r.err) return { ok: false, msg: r.err };
  try { await c.sb.from('van_service_log').insert({ tech_name: tech, service_date: new Date().toISOString().slice(0, 10), item: 'Oil + filter', mileage: miles }); } catch (_) {}
  revalidatePath('/my-truck');
  return { ok: true };
}

// Log a service / repair to the van log.
export async function logService(form) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const item = clean(form.get('item'), 120);
  if (!item) return { ok: false, msg: 'What was the service?' };
  const tech = vanTech(c, form);
  const { error } = await c.sb.from('van_service_log').insert({
    tech_name: tech, item, vendor: clean(form.get('vendor'), 80) || null,
    cost_cents: Math.max(0, Math.round((Number(form.get('cost')) || 0) * 100)),
    mileage: Math.max(0, Math.round(Number(form.get('mileage')) || 0)) || null,
    service_date: clean(form.get('date'), 10) && /^\d{4}-\d{2}-\d{2}$/.test(form.get('date')) ? form.get('date') : new Date().toISOString().slice(0, 10),
  });
  if (error) return { ok: false, msg: missing(error) ? 'Run supabase/96_van_maintenance.sql first.' : error.message };
  try { await c.sb.from('van_maintenance').update({ last_service_date: new Date().toISOString().slice(0, 10) }).eq('tech_name', tech); } catch (_) {}
  revalidatePath('/my-truck');
  return { ok: true };
}

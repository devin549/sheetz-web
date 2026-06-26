'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { GAS_LEVELS } from '@/lib/sod';

const clean = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
const missingTbl = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');
const today = () => new Date().toISOString().slice(0, 10);

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  return { user, profile: await loadProfile(user), sb: getSupabaseAdmin() };
}

// Find-or-create today's sod_checks row (shared with Start of Day) and patch the EOD fields.
async function patchToday(c, patch) {
  const day = today();
  const key = c.profile.tech_id;
  let row = null;
  try {
    const q = key
      ? await c.sb.from('sod_checks').select('*').eq('tech_id', key).eq('day', day).maybeSingle()
      : await c.sb.from('sod_checks').select('*').eq('tech_name', c.profile.name || c.user.email).eq('day', day).maybeSingle();
    row = q.data || null;
    if (q.error && missingTbl(q.error)) return { err: 'Run supabase/92_sod_checks.sql + 93_eod_checks.sql first.' };
  } catch (_) {}
  const base = { tech_id: key || null, tech_name: c.profile.name || c.user.email, day, updated_at: new Date().toISOString() };
  const merged = { ...(row || {}), ...base, ...patch };
  let res = row ? await c.sb.from('sod_checks').update(merged).eq('id', row.id) : await c.sb.from('sod_checks').insert(merged);
  if (res.error) return { err: missingTbl(res.error) ? 'Run supabase/93_eod_checks.sql first.' : res.error.message };
  revalidatePath('/end');
  return { ok: true };
}

export async function confirmToolsIn() {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const r = await patchToday(c, { tools_checked_in: true });
  return r.err ? { ok: false, msg: r.err } : { ok: true };
}

export async function saveEodVan(form) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const gas = clean(form.get('end_gas'), 20);
  const r = await patchToday(c, { end_odometer: Math.max(0, Math.round(Number(form.get('end_odometer')) || 0)) || null, end_gas: GAS_LEVELS.includes(gas) ? gas : null });
  return r.err ? { ok: false, msg: r.err } : { ok: true };
}

export async function setCash(custody, dollars) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const cd = ['dropped', 'hold'].includes(custody) ? custody : null;
  const r = await patchToday(c, { cash_custody: cd, cash_in_hand_cents: Math.max(0, Math.round((Number(dollars) || 0) * 100)) || null });
  if (!r.err) { try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'cash.custody', entity: 'sod', entity_id: today(), detail: { custody: cd, dollars } }); } catch (_) {} }
  return r.err ? { ok: false, msg: r.err } : { ok: true };
}

export async function clockOut() {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const r = await patchToday(c, { eod_done: true, eod_done_at: new Date().toISOString() });
  return r.err ? { ok: false, msg: r.err } : { ok: true };
}

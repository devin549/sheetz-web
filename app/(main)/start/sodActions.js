'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { GAS_LEVELS, gateState } from '@/lib/sod';

const clean = (v, n = 300) => String(v == null ? '' : v).trim().slice(0, n);
const missingTbl = (e) => /relation|column|schema cache|does not exist/i.test(e?.message || '');
const today = () => new Date().toISOString().slice(0, 10);

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  return { user, profile: await loadProfile(user), sb: getSupabaseAdmin() };
}

// Find-or-create today's row for this tech, then apply patch. Re-checks the gate after every change.
async function patchToday(c, patch) {
  const day = today();
  const key = c.profile.tech_id;
  let row = null;
  try {
    let q = key
      ? await c.sb.from('sod_checks').select('*').eq('tech_id', key).eq('day', day).maybeSingle()
      : await c.sb.from('sod_checks').select('*').eq('tech_name', c.profile.name || c.user.email).eq('day', day).maybeSingle();
    row = q.data || null;
    if (q.error && missingTbl(q.error)) return { err: 'Run supabase/92_sod_checks.sql first.' };
  } catch (_) {}

  const base = { tech_id: key || null, tech_name: c.profile.name || c.user.email, day, updated_at: new Date().toISOString() };
  const merged = { ...(row || {}), ...base, ...patch };
  // recompute the gate flag
  merged.completed = gateState(merged).ready;
  if (merged.completed && !merged.completed_at) merged.completed_at = new Date().toISOString();

  let res;
  if (row) res = await c.sb.from('sod_checks').update(merged).eq('id', row.id);
  else res = await c.sb.from('sod_checks').insert(merged);
  if (res.error) return { err: missingTbl(res.error) ? 'Run supabase/92_sod_checks.sql first.' : res.error.message };
  revalidatePath('/start');
  return { ok: true, completed: merged.completed };
}

export async function savePretrip(form) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const gas = clean(form.get('gas_level'), 20);
  const r = await patchToday(c, {
    pretrip_done: true,
    odometer: Math.max(0, Math.round(Number(form.get('odometer')) || 0)) || null,
    gas_level: GAS_LEVELS.includes(gas) ? gas : null,
    tires_ok: form.get('tires_ok') === 'on', oil_ok: form.get('oil_ok') === 'on',
    windshield_ok: form.get('windshield_ok') === 'on', spare_keys: form.get('spare_keys') === 'on',
    no_text_affirm: form.get('no_text_affirm') === 'on',
  });
  return r.err ? { ok: false, msg: r.err } : { ok: true, completed: r.completed };
}

export async function confirmTools(missing) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const r = await patchToday(c, { tools_confirmed: true, tools_missing: clean(missing, 500) || null });
  return r.err ? { ok: false, msg: r.err } : { ok: true, completed: r.completed };
}

export async function ackHandbook() {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const r = await patchToday(c, { handbook_acked: true, handbook_acked_at: new Date().toISOString() });
  // also record into policy_acks so it counts as the quarterly signature (best-effort).
  try { await c.sb.from('policy_acks').insert({ user_id: c.user.id, kind: 'handbook', acked_at: new Date().toISOString() }); } catch (_) {}
  return r.err ? { ok: false, msg: r.err } : { ok: true, completed: r.completed };
}

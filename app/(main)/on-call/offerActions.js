'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';

async function me() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  return { user, profile: await loadProfile(user), sb: getSupabaseAdmin() };
}
const isMgr = (r) => can(r, 'manageUsers') || can(r, 'assignJobs') || can(r, 'seeCrew');
const clean = (v, n = 120) => String(v || '').trim().slice(0, n);

// Manager posts an open on-call shift with a voluntary pickup bonus.
export async function offerShift(form) {
  const c = await me(); if (c.err) return { ok: false, msg: c.err };
  if (!isMgr(c.profile.role)) return { ok: false, msg: 'Supervisors post on-call.' };
  const label = clean(form.get('label'), 120);
  if (!label) return { ok: false, msg: 'Describe the shift.' };
  const bonus = Math.max(0, Math.round(Number(form.get('bonus')) || 0)) * 100;
  const date = clean(form.get('shift_date'), 10);
  const { error } = await c.sb.from('oncall_offers').insert({ label, shift_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, bonus_cents: bonus, posted_by: c.user.id, posted_by_name: c.profile.name || c.user.email });
  if (error) return { ok: false, msg: /relation|column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/84_oncall_offers.sql first.' : error.message };
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'oncall.offered', entity: 'oncall', entity_id: label, detail: { bonus_cents: bonus, date } }); } catch (_) {}
  revalidatePath('/on-call');
  return { ok: true };
}

// A tech VOLUNTEERS — first claim wins, gets the bonus. Atomic-ish: only claims if still open.
export async function claimShift(id) {
  const c = await me(); if (c.err) return { ok: false, msg: c.err };
  const { data: row } = await c.sb.from('oncall_offers').select('status, bonus_cents, label').eq('id', id).maybeSingle();
  if (!row) return { ok: false, msg: 'Shift not found.' };
  if (row.status !== 'open') return { ok: false, msg: 'Someone already grabbed it.' };
  const { error } = await c.sb.from('oncall_offers').update({ status: 'claimed', claimed_by: c.user.id, claimed_by_name: c.profile.name || c.user.email, claimed_at: new Date().toISOString(), forced: false }).eq('id', id).eq('status', 'open');
  if (error) return { ok: false, msg: error.message };
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'oncall.claimed', entity: 'oncall', entity_id: String(id), detail: { bonus_cents: row.bonus_cents } }); } catch (_) {}
  revalidatePath('/on-call');
  return { ok: true, msg: `You’ve got it${row.bonus_cents ? ` — +$${(row.bonus_cents / 100).toLocaleString()} bonus` : ''}.` };
}

// Manager FORCES a pull — random eligible tech assigned, NO bonus. (Pool = active techs/foremen.)
export async function forcePull(id) {
  const c = await me(); if (c.err) return { ok: false, msg: c.err };
  if (!isMgr(c.profile.role)) return { ok: false, msg: 'Supervisors run the lottery.' };
  const { data: row } = await c.sb.from('oncall_offers').select('status, label').eq('id', id).maybeSingle();
  if (!row || row.status !== 'open') return { ok: false, msg: 'Only an open shift can be force-pulled.' };
  let pool = [];
  try { const { data } = await c.sb.from('profiles').select('user_id, name').in('role', ['tech', 'foreman']).eq('active', true); pool = (data || []).filter((p) => p.name); } catch (_) {}
  if (!pool.length) return { ok: false, msg: 'No eligible techs to pull from.' };
  // Pick by a stable-but-spread index (no Math.random — pick from a rotating hash of the offer id + time).
  const seed = String(id).split('').reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, Date.now() % 100000);
  const pick = pool[Math.abs(seed) % pool.length];
  const { error } = await c.sb.from('oncall_offers').update({ status: 'forced', claimed_by: pick.user_id, claimed_by_name: pick.name, claimed_at: new Date().toISOString(), forced: true }).eq('id', id).eq('status', 'open');
  if (error) return { ok: false, msg: error.message };
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'oncall.forced', entity: 'oncall', entity_id: String(id), detail: { pulled: pick.name, no_bonus: true } }); } catch (_) {}
  revalidatePath('/on-call');
  return { ok: true, msg: `${pick.name} was pulled (no bonus — forced).` };
}

export async function cancelOffer(id) {
  const c = await me(); if (c.err) return { ok: false, msg: c.err };
  if (!isMgr(c.profile.role)) return { ok: false, msg: 'Supervisors only.' };
  await c.sb.from('oncall_offers').update({ status: 'cancelled' }).eq('id', id);
  revalidatePath('/on-call');
  return { ok: true };
}

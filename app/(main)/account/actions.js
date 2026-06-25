'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';

const LEVELS = ['PG', 'PG-13', 'R'];

// Set the daily roast level. Self = PICK-ONCE-THEN-LOCK (can't be re-gamed). Owner/GM/admin
// (manageUsers) can set any tech's level and it stays an override. PG is the safe floor.
export async function setRoastLevel(level, targetUserId) {
  if (!LEVELS.includes(level)) return { ok: false, msg: 'Pick PG, PG-13, or R.' };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const admin = can(profile.role, 'manageUsers');
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const targetId = (targetUserId && admin) ? targetUserId : user.id;
  if (!admin && targetId === user.id && profile.roastLocked) {
    return { ok: false, msg: '🔒 Your roast level is locked. A manager can change it.' };
  }
  const { error } = await sb.from('profiles').update({ roast_level: level, roast_locked: true }).eq('user_id', targetId);
  if (error) return { ok: false, msg: /column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/74_roast_level_and_prefs.sql first.' : error.message };
  revalidatePath('/account'); revalidatePath('/start');
  return { ok: true, msg: `Roast level set to ${level}.`, locked: true, level };
}

// Owner/GM/admin: unlock a tech so they can re-pick (or you re-pick for them).
export async function unlockRoastLevel(targetUserId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!can(profile.role, 'manageUsers')) return { ok: false, msg: 'Managers only.' };
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('profiles').update({ roast_locked: false }).eq('user_id', targetUserId || user.id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/account');
  return { ok: true, msg: 'Unlocked.' };
}

// Report this iPad lost/stolen — logs to audit_log so the office can lock/track it. Best-effort.
export async function reportLostDevice() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const sb = getSupabaseAdmin();
  try {
    await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'device.report_lost', entity: 'device', entity_id: user.id, detail: { email: user.email } });
  } catch (_) { /* audit_log optional — still confirm to the tech */ }
  return { ok: true, msg: '🚨 Reported. The office has been alerted to lock this device.' };
}

// Merge a small UI preference patch (notifications, reduce-motion, big-text) into profiles.prefs.
export async function savePrefs(patch) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  if (!patch || typeof patch !== 'object') return { ok: false, msg: 'Bad request.' };
  const sb = getSupabaseAdmin();
  const { data: cur } = await sb.from('profiles').select('prefs').eq('user_id', user.id).maybeSingle();
  const next = { ...((cur && cur.prefs) || {}), ...patch };
  const { error } = await sb.from('profiles').update({ prefs: next }).eq('user_id', user.id);
  if (error) return { ok: false, msg: /column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/74_roast_level_and_prefs.sql first.' : error.message };
  revalidatePath('/account');
  return { ok: true, msg: 'Saved.', prefs: next };
}

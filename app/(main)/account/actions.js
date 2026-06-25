'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { hashPin, validPin, signUnlock, CC_COOKIE, ccGated } from '@/lib/ccPin';

const LEVELS = ['PG', 'PG-13', 'R'];

// Set the daily roast level. Self = PICK-ONCE-THEN-LOCK (can't be re-gamed). Owner/GM/admin
// (manageUsers) can set any tech's level and it stays an override. PG is the safe floor.
export async function setRoastLevel(level, opts = {}) {
  const { targetUserId, rAccepted } = (typeof opts === 'string') ? { targetUserId: opts } : opts; // back-compat
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
  // R can never be set without the thick-skin re-consent — tell the client to show the modal.
  if (level === 'R' && !rAccepted) return { ok: false, needsRConsent: true, msg: 'R requires the thick-skin acceptance.' };

  const { error } = await sb.from('profiles').update({ roast_level: level, roast_locked: true }).eq('user_id', targetId);
  if (error) return { ok: false, msg: /column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/74_roast_level_and_prefs.sql first.' : error.message };
  if (level === 'R') { try { await sb.from('policy_acks').insert({ user_id: targetId, kind: 'roast_r', version: 'v1', detail: { agreed: true, by: user.id } }); } catch (_) {} }
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

// Report this iPad lost/stolen: ALERT the office (audit_log) AND immediately sign this device out so
// whoever has it loses access. Reactivation is an office action (we don't hard-disable the account on a
// self-tap, so a mis-report can't permanently lock a tech out). The client redirects to /login after.
export async function reportLostDevice() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const sb = getSupabaseAdmin();
  try {
    await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'device.report_lost', entity: 'device', entity_id: user.id, detail: { email: user.email } });
  } catch (_) { /* audit_log optional — still revoke + confirm */ }
  try { await supabase.auth.signOut(); } catch (_) { /* clears this session's cookies */ }
  return { ok: true, loggedOut: true, msg: '🚨 Reported — office alerted. Signing this iPad out…' };
}

// ── Command Center PIN (per-user second factor for the sensitive dashboard) ──────────────────────────
// Set or change your own Command Center PIN. Stored as a salted hash; setting it also unlocks now.
export async function setCommandCenterPin(pin) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!ccGated(profile.role)) return { ok: false, msg: 'No Command Center on your role.' };
  if (!validPin(pin)) return { ok: false, msg: 'PIN must be 4–8 digits.' };
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('profiles').update({ cc_pin_hash: hashPin(pin, user.id), cc_pin_set_at: new Date().toISOString() }).eq('user_id', user.id);
  if (error) return { ok: false, msg: /column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/76_command_center_pin.sql first.' : error.message };
  cookies().set(CC_COOKIE, signUnlock(user.id), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 1800 });
  revalidatePath('/'); revalidatePath('/account');
  return { ok: true, msg: 'Command Center PIN set.' };
}

// Verify the PIN and open the Command Center for this session (sets the short-lived unlock cookie).
export async function unlockCommandCenter(pin) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!ccGated(profile.role)) return { ok: false, msg: 'No Command Center on your role.' };
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('profiles').select('cc_pin_hash').eq('user_id', user.id).maybeSingle();
  if (!data || !data.cc_pin_hash) return { ok: false, msg: 'No PIN set yet — create one.' };
  if (hashPin(pin, user.id) !== data.cc_pin_hash) return { ok: false, msg: 'Wrong PIN.' };
  cookies().set(CC_COOKIE, signUnlock(user.id), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 1800 });
  revalidatePath('/');
  return { ok: true, msg: 'Unlocked.' };
}

// Re-lock the Command Center now (clear the unlock cookie).
export async function lockCommandCenter() {
  cookies().set(CC_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  revalidatePath('/');
  return { ok: true };
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

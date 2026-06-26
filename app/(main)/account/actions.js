'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { hashPin, validPin, signUnlock, CC_COOKIE, IPAD_COOKIE, IPAD_TTL_MS, ccGated } from '@/lib/ccPin';
import { sendOne } from '@/lib/email';
import { readLicense } from '@/lib/aiVision';

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

// Verify the PIN and open the Command Center for this session. Ported guard from CB_Tech_PinSecurity:
// 3 wrong attempts → 15-minute lockout, and on the 3rd fail we tell the client to snap an intruder photo.
const MAX_PIN_ATTEMPTS = 3;
const PIN_LOCK_MS = 15 * 60 * 1000;
export async function unlockCommandCenter(pin) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!ccGated(profile.role)) return { ok: false, msg: 'No Command Center on your role.' };
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('profiles').select('cc_pin_hash, cc_pin_attempts, cc_pin_lock_until').eq('user_id', user.id).maybeSingle();
  if (!data || !data.cc_pin_hash) return { ok: false, msg: 'No PIN set yet — create one.' };

  // Locked? (attempts columns may not exist yet → those reads are just undefined, so it degrades to no lock.)
  const lockUntil = data.cc_pin_lock_until ? Date.parse(data.cc_pin_lock_until) : 0;
  if (lockUntil > Date.now()) return { ok: false, locked: true, lockUntil: data.cc_pin_lock_until, msg: `🔒 Locked — try again in ${Math.ceil((lockUntil - Date.now()) / 60000)} min. Your login still works.` };

  if (hashPin(pin, user.id) === data.cc_pin_hash) {
    try { await sb.from('profiles').update({ cc_pin_attempts: 0, cc_pin_lock_until: null }).eq('user_id', user.id); } catch (_) {}
    cookies().set(CC_COOKIE, signUnlock(user.id), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 1800 });
    revalidatePath('/');
    return { ok: true, msg: 'Unlocked.' };
  }

  // Wrong PIN → count it.
  const attempts = (Number(data.cc_pin_attempts) || 0) + 1;
  if (attempts >= MAX_PIN_ATTEMPTS) {
    const until = new Date(Date.now() + PIN_LOCK_MS).toISOString();
    try { await sb.from('profiles').update({ cc_pin_attempts: 0, cc_pin_lock_until: until }).eq('user_id', user.id); } catch (_) {}
    try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'cc_pin.lockout', entity: 'security', entity_id: user.id, detail: { reason: '3 failed Command Center PIN attempts' } }); } catch (_) {}
    return { ok: false, locked: true, captureIntruder: true, lockUntil: until, msg: '🔒 Locked 15 min after 3 wrong PINs.' };
  }
  try { await sb.from('profiles').update({ cc_pin_attempts: attempts }).eq('user_id', user.id); } catch (_) {}
  const left = MAX_PIN_ATTEMPTS - attempts;
  return { ok: false, msg: `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.` };
}

// ── "PIN for this iPad" (everyone's quick app lock) — same hardening as the Command Center PIN ────────
const cookieOpts = { httpOnly: true, sameSite: 'lax', path: '/', maxAge: Math.floor(IPAD_TTL_MS / 1000) };
const ipadUnlock = (uid) => signUnlock(uid, IPAD_TTL_MS);
export async function setIpadPin(pin) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  if (!validPin(pin)) return { ok: false, msg: 'PIN must be 4–8 digits.' };
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('profiles').update({ ipad_pin_hash: hashPin(pin, user.id), ipad_pin_set_at: new Date().toISOString(), ipad_pin_attempts: 0, ipad_pin_lock_until: null }).eq('user_id', user.id);
  if (error) return { ok: false, msg: /column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/78_ipad_pin.sql first.' : error.message };
  cookies().set(IPAD_COOKIE, ipadUnlock(user.id), cookieOpts);
  revalidatePath('/', 'layout');
  return { ok: true, msg: 'iPad PIN set.' };
}

export async function unlockIpad(pin) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const sb = getSupabaseAdmin();
  const { data } = await sb.from('profiles').select('ipad_pin_hash, ipad_pin_attempts, ipad_pin_lock_until').eq('user_id', user.id).maybeSingle();
  if (!data || !data.ipad_pin_hash) return { ok: false, msg: 'No PIN set yet — create one.' };
  const lockUntil = data.ipad_pin_lock_until ? Date.parse(data.ipad_pin_lock_until) : 0;
  if (lockUntil > Date.now()) return { ok: false, locked: true, lockUntil: data.ipad_pin_lock_until, msg: `🔒 Locked — try again in ${Math.ceil((lockUntil - Date.now()) / 60000)} min.` };
  if (hashPin(pin, user.id) === data.ipad_pin_hash) {
    try { await sb.from('profiles').update({ ipad_pin_attempts: 0, ipad_pin_lock_until: null }).eq('user_id', user.id); } catch (_) {}
    cookies().set(IPAD_COOKIE, ipadUnlock(user.id), cookieOpts);
    revalidatePath('/', 'layout');
    return { ok: true, msg: 'Unlocked.' };
  }
  const attempts = (Number(data.ipad_pin_attempts) || 0) + 1;
  if (attempts >= MAX_PIN_ATTEMPTS) {
    const until = new Date(Date.now() + PIN_LOCK_MS).toISOString();
    try { await sb.from('profiles').update({ ipad_pin_attempts: 0, ipad_pin_lock_until: until }).eq('user_id', user.id); } catch (_) {}
    try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'ipad_pin.lockout', entity: 'security', entity_id: user.id, detail: { reason: '3 failed iPad PIN attempts' } }); } catch (_) {}
    return { ok: false, locked: true, captureIntruder: true, lockUntil: until, msg: '🔒 Locked 15 min after 3 wrong PINs.' };
  }
  try { await sb.from('profiles').update({ ipad_pin_attempts: attempts }).eq('user_id', user.id); } catch (_) {}
  const left = MAX_PIN_ATTEMPTS - attempts;
  return { ok: false, msg: `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.` };
}

// Called right after a password sign-in so the tech isn't immediately re-prompted for their iPad PIN.
export async function markIpadUnlocked() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  cookies().set(IPAD_COOKIE, ipadUnlock(user.id), cookieOpts);
  return { ok: true };
}

export async function lockIpad() {
  cookies().set(IPAD_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  revalidatePath('/', 'layout');
  return { ok: true };
}

// On the 3rd failed PIN, the client snaps a front-camera photo and hands it here: store it in the private
// bucket, log it, and email the photo to owner/GM/admin. All best-effort — a denied camera still locks +
// alerts (without a photo). Mirrors CB_Tech_PinSecurity's intruder capture.
export async function reportIntruder(photoDataUrl) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const profile = await loadProfile(user);
  const sb = getSupabaseAdmin();
  let stored = null;
  try {
    if (typeof photoDataUrl === 'string' && /^data:image\//.test(photoDataUrl)) {
      const buf = Buffer.from(photoDataUrl.split(',')[1], 'base64');
      const path = `${user.id}/${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
      const up = await sb.storage.from('intruder-photos').upload(path, buf, { contentType: 'image/jpeg', upsert: false });
      if (!up.error) stored = path;
    }
  } catch (_) {}
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'cc_pin.intruder', entity: 'security', entity_id: user.id, detail: { photo: stored, account: user.email } }); } catch (_) {}
  // Email owner/GM/admin with the photo attached.
  try {
    const { data: mgrs } = await sb.from('profiles').select('email, role').in('role', ['owner', 'admin', 'gm']);
    const recips = [...new Set((mgrs || []).map((m) => m.email).filter(Boolean))];
    const attachments = stored ? [{ filename: 'intruder.jpg', content: photoDataUrl.split(',')[1] }] : undefined;
    const html = `<h2>🚨 Command Center — 3 failed PIN attempts</h2>
      <p>Account <strong>${profile.name || user.email}</strong> (${user.email}, role: ${profile.role}) hit 3 wrong Command Center PINs and was locked for 15 minutes.</p>
      <p>${stored ? 'A front-camera photo is attached — verify it’s really them.' : 'No photo (camera denied/unavailable).'}</p>`;
    for (const to of recips) { await sendOne({ to, subject: '🚨 Command Center: 3 failed PIN attempts', html, attachments }); }
  } catch (_) {}
  return { ok: true };
}

// Re-lock the Command Center now (clear the unlock cookie).
export async function lockCommandCenter() {
  cookies().set(CC_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  revalidatePath('/');
  return { ok: true };
}

// 🪪 Scan a driver's license with Claude Vision → confirm it belongs to this tech. Stores ONLY name/expiry/
// state + the image in a private bucket; checks the name against the profile. Never stores the DL number/DOB.
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
export async function scanLicense(dataUrl) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const lic = await readLicense(dataUrl, profile.role);
  if (!lic) return { ok: false, msg: 'Couldn’t read the license — try a flat, glare-free shot. (AI may be off.)' };
  if (!lic.isLicense) return { ok: false, msg: 'That doesn’t look like a driver’s license — try again.' };

  // Name match against the profile (first + last appearing in either order).
  const pn = normName(profile.name).split(' ').filter(Boolean);
  const ln = normName(lic.name);
  const matches = pn.length > 0 && pn.every((part) => ln.includes(part));

  const sb = getSupabaseAdmin();
  let stored = null;
  try {
    const img = String(dataUrl).match(/^data:image\/[a-z.+-]+;base64,(.+)$/i);
    if (img) { const up = await sb.storage.from('tech-ids').upload(`${user.id}/license.jpg`, Buffer.from(img[1], 'base64'), { contentType: 'image/jpeg', upsert: true }); if (!up.error) stored = true; }
  } catch (_) {}
  const { error } = await sb.from('profiles').update({ license_on_file: true, license_name: lic.name, license_expiry: lic.expiry, license_state: lic.state, license_scanned_at: new Date().toISOString() }).eq('user_id', user.id);
  if (error) return { ok: false, msg: /column|schema cache|does not exist/i.test(error.message || '') ? 'Run supabase/79_license_identity.sql first.' : error.message };
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'identity.license_scanned', entity: 'tech', entity_id: user.id, detail: { matches, expiry: lic.expiry, state: lic.state } }); } catch (_) {}
  revalidatePath('/account');
  return { ok: true, license: { name: lic.name, expiry: lic.expiry, state: lic.state, confidence: lic.confidence }, matches, stored };
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

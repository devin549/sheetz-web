'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { can, ROLE_IDS } from '@/lib/roles';
import { POSITION_IDS } from '@/lib/positions';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';

// Re-check the CALLER can manage users on every action — a server action is a public RPC,
// so guarding only the page is not enough. Authorizes off the profiles table (same source of
// truth as every page guard), not auth metadata. Returns the admin client + caller, or throws.
async function assertManager() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not allowed.');
  const profile = await loadProfile(user);
  if (!can(profile.role, 'manageUsers')) throw new Error('Not allowed.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured (SUPABASE_SERVICE_ROLE_KEY missing).');
  return { sb, caller: user, callerRole: profile.role };
}

// High-trust roles only an owner may grant — keeps an Office Manager (manageUsers) from minting
// owners/accounting. Non-owner managers can still add staff + assign everyday roles.
const HIGH_TRUST = ['owner', 'admin', 'gm', 'accounting'];
const canGrant = (callerRole, targetRole) => !HIGH_TRUST.includes(targetRole) || ['owner', 'admin'].includes(callerRole);

// Mirror a login into the server-authoritative profiles table. Guarded: if profiles isn't
// migrated yet, this no-ops (auth user_metadata stays the fallback) — returns whether it stuck.
async function upsertProfile(sb, userId, fields) {
  try {
    const { error } = await sb.from('profiles').upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    return !error;
  } catch { return false; }
}

// Create a login. Devin types name + email + temp password and picks the role (position).
export async function addUser(formData) {
  let sb, callerRole;
  try { ({ sb, callerRole } = await assertManager()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }

  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const role = String(formData.get('role') || '').trim();
  const password = String(formData.get('password') || '');

  if (!email || email.indexOf('@') < 0) return { ok: false, msg: 'Enter a valid email.' };
  if (!ROLE_IDS.includes(role)) return { ok: false, msg: 'Pick a position.' };
  if (!canGrant(callerRole, role)) return { ok: false, msg: 'Only an owner can assign owner / GM / accounting roles.' };
  if (password.length < 8) return { ok: false, msg: 'Temp password must be at least 8 characters.' };

  const { data: created, error } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name, role },
  });
  if (error) return { ok: false, msg: error.message };
  if (created?.user?.id) await upsertProfile(sb, created.user.id, { name, email, role, active: true });

  revalidatePath('/team');
  return { ok: true, msg: `✓ Added ${name || email} as ${role}. They sign in with this email + the temp password.` };
}

// Change someone's position. Merge metadata so we never wipe their name.
export async function setRole(formData) {
  let sb, callerRole;
  try { ({ sb, callerRole } = await assertManager()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }

  const id = String(formData.get('id') || '');
  const role = String(formData.get('role') || '');
  if (!id || !ROLE_IDS.includes(role)) return { ok: false, msg: 'Bad request.' };
  if (!canGrant(callerRole, role)) return { ok: false, msg: 'Only an owner can assign owner / GM / accounting roles.' };

  const { data } = await sb.auth.admin.getUserById(id);
  const meta = (data && data.user && data.user.user_metadata) || {};
  const { error } = await sb.auth.admin.updateUserById(id, { user_metadata: { ...meta, role } });
  if (error) return { ok: false, msg: error.message };
  await upsertProfile(sb, id, { role, name: meta.name || '', email: (data && data.user && data.user.email) || '' });

  revalidatePath('/team');
  return { ok: true, msg: 'Role updated.' };
}

// Fire / re-hire a login. Deactivating BANS the Supabase auth user (they can't sign in — getUser
// fails immediately, so the middleware bounces them) and marks profiles.active=false. Reversible.
// Non-owners can't deactivate a high-trust user (owner/GM/accounting). Reuses canGrant on the target.
export async function setUserActive(formData) {
  let sb, callerRole;
  try { ({ sb, callerRole } = await assertManager()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const id = String(formData.get('id') || '');
  const active = String(formData.get('active') || '') === 'true';
  if (!id) return { ok: false, msg: 'Bad request.' };

  const { data } = await sb.auth.admin.getUserById(id);
  const meta = (data && data.user && data.user.user_metadata) || {};
  const targetRole = meta.role || 'viewer';
  if (!canGrant(callerRole, targetRole)) return { ok: false, msg: 'Only an owner can deactivate an owner / GM / accounting login.' };

  const { error } = await sb.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : '876600h' });
  if (error) return { ok: false, msg: error.message };
  await upsertProfile(sb, id, { active, role: targetRole, name: meta.name || '', email: (data && data.user && data.user.email) || '' });

  revalidatePath('/team');
  return { ok: true, msg: active ? 'Re-activated — they can sign in again.' : 'Deactivated — access revoked immediately.' };
}

// Set a roster person's POSITION — controls who shows in the Job Booking picker + board rows.
// (Separate from login role: this is the field roster, not access. Access = role under logins.)
export async function setTechPosition(formData) {
  let sb;
  try { ({ sb } = await assertManager()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const id = String(formData.get('id') || '');
  const position = String(formData.get('position') || '');
  if (!id || !POSITION_IDS.includes(position)) return { ok: false, msg: 'Bad request.' };

  const { error } = await sb.from('techs').update({ position }).eq('id', id);
  if (error) return { ok: false, msg: /position|schema cache|column/i.test(error.message || '') ? 'Run supabase/38_tech_position.sql first.' : error.message };
  revalidatePath('/team'); revalidatePath('/booking'); revalidatePath('/board');
  return { ok: true, msg: 'Position updated.' };
}

// Assign which field supervisor manages this person — drives meeting/announcement targeting ("my crew").
export async function setTechSupervisor(formData) {
  let sb;
  try { ({ sb } = await assertManager()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const id = String(formData.get('id') || '');
  const supervisor = String(formData.get('supervisor') || '').trim().slice(0, 80);
  if (!id) return { ok: false, msg: 'Bad request.' };
  const { error } = await sb.from('techs').update({ supervisor: supervisor || null }).eq('id', id);
  if (error) return { ok: false, msg: /supervisor|column|schema cache/i.test(error.message || '') ? 'Run supabase/64_tech_supervisor.sql first.' : error.message };
  revalidatePath('/team'); revalidatePath('/meetings');
  return { ok: true, msg: 'Supervisor set.' };
}

// Map a roster person to their Discord name/handle — so 👍 reactions on #sheetz meeting posts match them
// (no need for anyone to rename in Discord). Set it to what shows next to their face in Discord.
export async function setTechDiscord(formData) {
  let sb;
  try { ({ sb } = await assertManager()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const id = String(formData.get('id') || '');
  const discord_name = String(formData.get('discord_name') || '').trim().slice(0, 80);
  if (!id) return { ok: false, msg: 'Bad request.' };
  const { error } = await sb.from('techs').update({ discord_name: discord_name || null }).eq('id', id);
  if (error) return { ok: false, msg: /discord|column|schema cache/i.test(error.message || '') ? 'Run supabase/61_comms_desk.sql first.' : error.message };
  revalidatePath('/team'); revalidatePath('/messages');
  return { ok: true, msg: 'Discord name saved.' };
}

// Set a roster person's phone — so the office can text them (dispatch.me link, etc.).
export async function setTechPhone(formData) {
  let sb;
  try { ({ sb } = await assertManager()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const id = String(formData.get('id') || '');
  const phone = String(formData.get('phone') || '').trim().slice(0, 40);
  if (!id) return { ok: false, msg: 'Bad request.' };
  const { error } = await sb.from('techs').update({ phone: phone || null }).eq('id', id);
  if (error) return { ok: false, msg: /phone|column|schema cache/i.test(error.message || '') ? 'Run supabase/43_tech_phone.sql first.' : error.message };
  revalidatePath('/team');
  return { ok: true, msg: 'Phone saved.' };
}

// Link (or unlink) a login to a tech row so a tech sees ONLY their own jobs. techId '' = unlink.
export async function setTechLink(formData) {
  let sb;
  try { ({ sb } = await assertManager()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  const id = String(formData.get('id') || '');
  const techId = String(formData.get('techId') || '') || null;
  if (!id) return { ok: false, msg: 'Bad request.' };

  const { data } = await sb.auth.admin.getUserById(id);
  const meta = (data && data.user && data.user.user_metadata) || {};
  const ok = await upsertProfile(sb, id, { tech_id: techId, role: meta.role || 'viewer', name: meta.name || '', email: (data && data.user && data.user.email) || '' });
  if (!ok) return { ok: false, msg: 'Couldn’t save — run supabase/24_profiles.sql first (profiles table missing).' };

  revalidatePath('/team');
  return { ok: true, msg: techId ? 'Linked to tech — they’ll see only their jobs.' : 'Tech link cleared.' };
}

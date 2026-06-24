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
  return { sb, caller: user };
}

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
  let sb;
  try { ({ sb } = await assertManager()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }

  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const role = String(formData.get('role') || '').trim();
  const password = String(formData.get('password') || '');

  if (!email || email.indexOf('@') < 0) return { ok: false, msg: 'Enter a valid email.' };
  if (!ROLE_IDS.includes(role)) return { ok: false, msg: 'Pick a position.' };
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
  let sb;
  try { ({ sb } = await assertManager()); } catch (e) { return { ok: false, msg: String(e.message || e) }; }

  const id = String(formData.get('id') || '');
  const role = String(formData.get('role') || '');
  if (!id || !ROLE_IDS.includes(role)) return { ok: false, msg: 'Bad request.' };

  const { data } = await sb.auth.admin.getUserById(id);
  const meta = (data && data.user && data.user.user_metadata) || {};
  const { error } = await sb.auth.admin.updateUserById(id, { user_metadata: { ...meta, role } });
  if (error) return { ok: false, msg: error.message };
  await upsertProfile(sb, id, { role, name: meta.name || '', email: (data && data.user && data.user.email) || '' });

  revalidatePath('/team');
  return { ok: true, msg: 'Role updated.' };
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

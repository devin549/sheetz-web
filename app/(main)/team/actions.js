'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { roleOf } from '@/lib/nav';
import { can, ROLE_IDS } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

// Re-check the CALLER can manage users on every action — a server action is a public RPC,
// so guarding only the page is not enough. Returns the admin client + caller, or throws.
async function assertManager() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !can(roleOf(user), 'manageUsers')) throw new Error('Not allowed.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured (SUPABASE_SERVICE_ROLE_KEY missing).');
  return { sb, caller: user };
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

  const { error } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name, role },
  });
  if (error) return { ok: false, msg: error.message };

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

  revalidatePath('/team');
  return { ok: true, msg: 'Role updated.' };
}

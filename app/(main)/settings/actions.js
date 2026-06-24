'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { can } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

export async function saveGoal(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !can(profile.role, 'manageUsers')) return { ok: false, msg: 'Your role can’t edit goals.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const key = String(formData.get('key') || '').trim().slice(0, 60);
  const target = Math.max(0, Number(formData.get('target')) || 0);
  if (!key) return { ok: false, msg: 'No goal.' };
  const { error } = await sb.from('office_goals').update({ target, updated_at: new Date().toISOString(), updated_by: profile.name || user.email }).eq('key', key);
  if (error) { if (/could not find|does not exist|schema cache/i.test(error.message || '')) return { ok: false, msg: 'Run supabase/34_goals.sql first.' }; return { ok: false, msg: error.message }; }
  revalidatePath('/settings');
  revalidatePath('/board');
  return { ok: true, msg: 'Saved.' };
}

'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';

const VIEW = ['owner', 'admin', 'gm', 'om', 'csr', 'dispatcher', 'accounting', 'sales', 'marketing'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await loadProfile(user) : null;
  if (!user || !profile || profile.active === false || !VIEW.includes(String(profile.role || '').toLowerCase())) return null;
  return getSupabaseAdmin();
}

// Mark a promise / follow-up done (org-wide view of customer_interactions).
export async function completePromise(id) {
  const sb = await gate();
  if (!sb) return { ok: false, msg: 'Not allowed.' };
  if (!id) return { ok: false, msg: 'No promise.' };
  const { error } = await sb.from('customer_interactions').update({ status: 'done', done_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/promises'); revalidatePath('/accounts');
  return { ok: true, msg: 'Done.' };
}

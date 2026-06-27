'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { doPull } from '@/lib/powerPlunger';

// One slot pull for the signed-in tech. The engine enforces earned-pulls + the company budget cap
// server-side (can't be cheated from the client), records the result, and routes any win to payroll.
export async function pullSlot() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Unavailable right now.' };
  const res = await doPull(sb, { techId: profile.tech_id, name: profile.name || user.email });
  revalidatePath('/start');
  revalidatePath('/races');
  return res;
}

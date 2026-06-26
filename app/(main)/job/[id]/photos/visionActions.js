'use server';

import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { reviewPhoto } from '@/lib/aiVision';

// Pre-check a shot with Claude Vision BEFORE it's uploaded — catches blurry/dark/wrong-subject photos so
// the tech re-shoots on the spot instead of the supervisor bouncing it later. Fails soft → null.
export async function prescanPhoto(dataUrl, jobType, requiredKinds) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const r = await reviewPhoto({ dataUrl, jobType: jobType || '', requiredKinds: Array.isArray(requiredKinds) ? requiredKinds : [], role: profile.role });
  if (!r) return { ok: false, msg: 'Pre-check unavailable right now — upload anyway, the office still reviews it.' };
  return { ok: true, review: r };
}

'use server';

import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { readDataPlate } from '@/lib/aiVision';

// Read a snapped appliance data plate with Claude Vision → structured fields (brand/model/fuel/capacity).
// Returns null if AI is off or it couldn't read the plate; the client shows a graceful "couldn't read" state.
export async function scanDataPlate(dataUrl) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const plate = await readDataPlate(dataUrl, profile.role);
  if (!plate) return { ok: false, msg: 'Couldn’t read the plate — try a closer, glare-free shot. (AI may be off.)' };
  return { ok: true, plate };
}

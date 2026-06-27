'use server';

// 📷 Snap-the-odometer OCR — read total miles off a dashboard photo so the tech doesn't type it (end-of-
// shift + van maintenance). Uses the shared AI Vision (Claude) keyed to the user's role. Photo never stored.
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { readOdometer } from '@/lib/aiVision';

export async function scanOdometer(dataUrl) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Not signed in.' };
  const profile = await loadProfile(user);
  if (profile.active === false) return { ok: false, msg: 'Not allowed.' };
  if (!/^data:image\//.test(String(dataUrl || ''))) return { ok: false, msg: 'Send a photo.' };
  const r = await readOdometer(String(dataUrl).slice(0, 12_000_000), profile.role || 'tech');
  if (!r) return { ok: false, msg: 'Vision isn’t set up — type it in.' };
  if (r.miles == null) return { ok: false, msg: 'Couldn’t read the odometer — try a clearer shot or type it.' };
  return { ok: true, miles: r.miles, confidence: r.confidence };
}

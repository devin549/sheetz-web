'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { geocodeFull, mapsConfigured } from '@/lib/maps';

// Save the tech's home address — geocoded with the Google Maps API so Start of Day can tell them what
// time to leave the house to make the first customer's promised window. Private to the tech + the app.
export async function setMyHome(address) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const addr = String(address || '').trim().slice(0, 200);
  const sb = getSupabaseAdmin();

  if (!addr) {
    await sb.from('profiles').update({ home_address: null, home_lat: null, home_lng: null }).eq('user_id', user.id);
    revalidatePath('/account'); revalidatePath('/start');
    return { ok: true, msg: 'Home address cleared.' };
  }
  if (!mapsConfigured()) return { ok: false, msg: 'Maps not set up yet — add GOOGLE_MAPS_KEY in Vercel.' };

  const g = await geocodeFull(addr);
  if (!g || typeof g.lat !== 'number') return { ok: false, msg: "Couldn't find that address — double-check it and try again." };

  const { error } = await sb.from('profiles').update({ home_address: g.formatted || addr, home_lat: g.lat, home_lng: g.lng }).eq('user_id', user.id);
  if (error) return { ok: false, msg: /home_|column|schema cache/i.test(error.message || '') ? 'Run supabase/116_tech_home.sql first.' : error.message };
  revalidatePath('/account'); revalidatePath('/start');
  return { ok: true, msg: 'Home saved — Start of Day will tell you when to leave.', formatted: g.formatted };
}

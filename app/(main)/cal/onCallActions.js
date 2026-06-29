'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';

// Record that the signed-in tech acknowledged an on-call window. Persisted to profiles.prefs.oncall_acked so
// it survives a refresh, clears the Cal nav badge, and the office can see it confirmed (vs the old local-only
// v1). Merges the id in (dedup); best-effort — never throws into the banner.
export async function acknowledgeOnCall(windowId) {
  const id = String(windowId || '').trim().slice(0, 80);
  if (!id) return { ok: false, msg: 'No window.' };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, msg: 'Sign in required.' };
  const profile = await loadProfile(user);
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const prev = Array.isArray(profile.prefs?.oncall_acked) ? profile.prefs.oncall_acked : [];
  if (prev.includes(id)) return { ok: true, msg: 'Already acknowledged.' };
  const next = [...prev, id].slice(-50); // cap so the list can't grow unbounded across rotations
  try {
    const { error } = await sb.from('profiles').update({ prefs: { ...(profile.prefs || {}), oncall_acked: next } }).eq('user_id', user.id);
    if (error) return { ok: false, msg: error.message };
  } catch (e) { return { ok: false, msg: String(e?.message || e) }; }
  try { await sb.from('audit_log').insert({ actor_id: user.id, actor_name: profile.name || user.email, role: profile.role, action: 'oncall.ack', entity: 'on_call', entity_id: id, detail: {} }); } catch (_) {}
  revalidatePath('/pto'); revalidatePath('/', 'layout');
  return { ok: true, msg: 'Acknowledged — office notified.' };
}

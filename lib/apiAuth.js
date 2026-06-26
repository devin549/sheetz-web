// lib/apiAuth.js — resolve the signed-in user inside an API route WITHOUT redirecting (guard.js
// redirects, which a fetch() can't follow). Returns { user, role, profile } or null. Same-origin
// session cookie only — these routes expose cost/margin data, so they must never be CORS-opened.
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';

export async function apiUser() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const profile = await loadProfile(user);
    if (profile.active === false) return null;
    return { user, role: profile.role, profile };
  } catch (_) { return null; }
}

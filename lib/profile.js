import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';

// Loads the employee profile for a signed-in auth user — the server-authoritative source of
// role + scope (tech_id / crew_id / active). Falls back to auth user_metadata when the profiles
// table or row isn't there yet, so this is safe to ship before every login is backfilled.
//
// Returns: { role, tech_id, crew_id, active, name, email }
export async function loadProfile(user) {
  const meta = (user && user.user_metadata) || {};
  const fallback = {
    role: meta.role || 'viewer',
    tech_id: meta.tech_id || null,
    crew_id: meta.crew_id || null,
    active: true,
    name: meta.name || (user && user.email) || '',
    email: (user && user.email) || '',
  };
  if (!user || !isAdminConfigured) return fallback;

  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('profiles')
      .select('role, tech_id, crew_id, active, name, email')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error || !data) return fallback; // table/row missing → metadata fallback (no lockout)
    return {
      role: data.role || fallback.role,
      tech_id: data.tech_id ?? fallback.tech_id,
      crew_id: data.crew_id ?? fallback.crew_id,
      active: data.active !== false,
      name: data.name || fallback.name,
      email: data.email || fallback.email,
    };
  } catch {
    return fallback;
  }
}

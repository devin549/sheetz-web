// "This tech's jobs" scoping for a Supabase jobs query. Prefers the exact tech_id link (a profile
// tied to a roster `techs` row), but falls back to tech_email / tech_name match — mirroring My Day —
// so a tech who logs in WITHOUT being linked to a `techs` row still sees the jobs dispatch assigned
// to them by name/email. Without this fallback, Start/End of Day silently show 0 jobs for any
// unlinked tech (e.g. a brand-new hire, or a test login).
const NO_MATCH = '00000000-0000-0000-0000-000000000000';

export function techIdentity({ profile, user } = {}) {
  const email = String(profile?.email || user?.email || '').trim().toLowerCase();
  const name = String(profile?.name || user?.user_metadata?.name || '').trim();
  return { techId: profile?.tech_id || null, email, name };
}

// Apply the scope filter to an existing supabase query builder and return it.
export function scopeToTech(query, ctx) {
  const { techId, email, name } = techIdentity(ctx);
  if (techId) return query.eq('tech_id', techId);
  const ors = [];
  if (email) ors.push(`tech_email.eq.${email}`);
  if (name) ors.push(`tech_name.ilike.%${name}%`);
  if (!ors.length) return query.eq('id', NO_MATCH); // no identity at all → match nothing
  return query.or(ors.join(','));
}

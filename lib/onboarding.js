// Onboarding-gate logic for the tech iPad. The gate (Monitoring Disclosure + Handbook + NDA + roast
// rating) must be cleared before a field tech sees ANY screen — mirrors the Apps Script SPA's required
// modals. Bump a version here when the policy text changes and techs will be asked to re-acknowledge.
export const POLICY_VERSIONS = { monitoring: 'v1', handbook: 'v4.2', nda: 'v4.2', roast_r: 'v1' };

// Latest acceptance per kind for a user. `available` is false when the policy_acks table can't be read
// (migration 75 not applied yet) — in that case the gate FAILS OPEN so techs are never trapped behind a
// gate that has nowhere to write. The gate only goes live once the table exists.
export async function loadOnboarding(sb, userId, profile) {
  const acks = { available: true, monitoring: false, handbook: false, nda: false, roastR: false, onboardedAt: profile?.onboardedAt || null };
  try {
    const { data, error } = await sb.from('policy_acks').select('kind').eq('user_id', userId);
    if (error) { acks.available = false; return acks; } // table missing / unreadable → don't gate
    for (const a of (data || [])) {
      if (a.kind === 'monitoring') acks.monitoring = true;
      else if (a.kind === 'handbook') acks.handbook = true;
      else if (a.kind === 'nda') acks.nda = true;
      else if (a.kind === 'roast_r') acks.roastR = true;
    }
  } catch (_) { acks.available = false; }
  return acks;
}

// Gate cleared? Fails OPEN if the policy store isn't ready. Otherwise needs monitoring + handbook + nda +
// a LOCKED roast level, and if that level is R, the separate R re-consent. onboarded_at is also honored
// as a fast "already cleared" flag.
export function onboardingComplete(profile, acks) {
  if (!acks || acks.available === false) return true; // infra not ready → never trap the tech
  if (profile?.onboardedAt) return true;
  const roastPicked = !!profile.roastLocked;
  const rOk = profile.roastLevel !== 'R' || acks.roastR;
  return acks.monitoring && acks.handbook && acks.nda && roastPicked && rOk;
}

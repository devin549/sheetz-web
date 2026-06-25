// Onboarding-gate logic for the tech iPad. The gate (Monitoring Disclosure + Handbook + NDA + roast
// rating) must be cleared before a field tech sees ANY screen — mirrors the Apps Script SPA's required
// modals. Bump a version here when the policy text changes and techs will be asked to re-acknowledge.
export const POLICY_VERSIONS = { monitoring: 'v1', handbook: 'v4.2', nda: 'v4.2', roast_r: 'v1' };

// Latest acceptance per kind for a user + the onboarded flag from profiles. Fail-soft.
export async function loadOnboarding(sb, userId, profile) {
  const acks = { monitoring: false, handbook: false, nda: false, roastR: false, onboardedAt: profile?.onboardedAt || null };
  try {
    const { data, error } = await sb.from('policy_acks').select('kind').eq('user_id', userId);
    if (!error) for (const a of (data || [])) {
      if (a.kind === 'monitoring') acks.monitoring = true;
      else if (a.kind === 'handbook') acks.handbook = true;
      else if (a.kind === 'nda') acks.nda = true;
      else if (a.kind === 'roast_r') acks.roastR = true;
    }
  } catch (_) { /* table not migrated yet → treat as not-accepted so the gate still shows */ }
  return acks;
}

// Gate cleared? Needs monitoring + handbook + nda + a LOCKED roast level, and if that level is R, the
// separate R re-consent too.
export function onboardingComplete(profile, acks) {
  if (!acks) return false;
  const roastPicked = !!profile.roastLocked;
  const rOk = profile.roastLevel !== 'R' || acks.roastR;
  return acks.monitoring && acks.handbook && acks.nda && roastPicked && rOk;
}

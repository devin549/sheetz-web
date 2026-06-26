import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { resolveShell, switchableShells } from '@/lib/shells';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { weeklyLeaderboard, onTimeStreak, techXp } from '@/lib/leaderboard';
import { can } from '@/lib/roles';
import { loadOnboarding, onboardingComplete } from '@/lib/onboarding';
import { verifyUnlock, IPAD_COOKIE } from '@/lib/ccPin';
import Sidebar from './Sidebar';
import TechShell from './TechShell';
import HelperShell from './HelperShell';
import Onboarding from './Onboarding';
import CommandCenterPinGate from './CommandCenterPinGate';

// The tech's in-progress job (enroute/on-site) for the always-visible header pin — so they never lose
// customer context. Guarded + best-effort: any failure just means no pin (the cockpit still renders).
async function loadActiveJob(techId) {
  if (!techId) return null;
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return null;
    let q = await sb.from('jobs')
      .select('id, job_number, status, lat, lng, customers(name, address)')
      .eq('tech_id', techId).in('status', ['enroute', 'on_site', 'onsite', 'rolling'])
      .order('scheduled_at', { ascending: true }).limit(1);
    if (q.error) q = await sb.from('jobs') // pre-08 (no lat/lng)
      .select('id, job_number, status, customers(name, address)')
      .eq('tech_id', techId).in('status', ['enroute', 'on_site', 'onsite', 'rolling'])
      .order('scheduled_at', { ascending: true }).limit(1);
    const j = q.data && q.data[0];
    if (!j) return null;
    const s = String(j.status || '').toLowerCase();
    const onSite = /on_?site/.test(s);
    return { id: j.id, number: j.job_number || '', customer: (j.customers && j.customers.name) || 'Active job', address: (j.customers && j.customers.address) || '', lat: j.lat ?? null, lng: j.lng ?? null, onSite, statusLabel: onSite ? 'ON-SITE' : 'EN ROUTE' };
  } catch { return null; }
}

// Auth-gated group — always rendered per-request (never statically prerendered at build).
export const dynamic = 'force-dynamic';

export default async function MainLayout({ children }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await loadProfile(user);
  const role = profile.role;
  const name = profile.name || user.email;

  // 🚐 "PIN for this iPad" — app-wide quick lock for anyone who set one. Activates only after migration 78
  // and only once a PIN exists, so it never blocks a tech who hasn't opted in. Shown before everything else.
  if (profile.ipadPinReady && profile.ipadPinSet) {
    const ipadUnlocked = verifyUnlock(user.id, cookies().get(IPAD_COOKIE)?.value);
    if (!ipadUnlocked) return <CommandCenterPinGate kind="ipad" hasPin title="PIN for this iPad" lockUntil={profile.ipadLockUntil} />;
  }

  // Shell = subdomain (when live) → else the cookie override → else the role default.
  const host = headers().get('host') || '';
  const cookieShell = cookies().get('cb_shell')?.value || '';
  const shell = resolveShell({ host, cookieShell, role, fieldMode: profile.fieldMode, shopMode: profile.shopMode });
  const shells = switchableShells({ role, fieldMode: profile.fieldMode, shopMode: profile.shopMode });

  // Onboarding GATE — a field tech (tech shell, non-manager) sees NOTHING until they clear Monitoring +
  // Handbook + NDA + roast rating. Owner/GM/admin are exempt (they manage the policy, not gated by it).
  if (shell === 'tech' && !can(role, 'manageUsers')) {
    const acks = await loadOnboarding(getSupabaseAdmin(), user.id, profile);
    if (!onboardingComplete(profile, acks)) return <Onboarding name={name} />;
  }

  // Field shell = iPad cockpit chrome (no office sidebar/topbar). Office/Shop = the desktop sidebar.
  if (shell === 'tech') {
    const activeJob = await loadActiveJob(profile.tech_id);
    const wmId = String(user.id || '').replace(/-/g, '').slice(0, 8); // short leak-trace id → maps to this user

    // Helper = the phone-only simple seat: stripped chrome, NO money/pricing/races/estimate anywhere.
    // (Same onboarding gate above already applied; helper perms also block money server-side.)
    if (String(role || '').toLowerCase() === 'helper') {
      return <HelperShell name={name} activeJob={activeJob} wmId={wmId}>{children}</HelperShell>;
    }

    // Live rank + on-time streak in the ribbon (real data); Power Plunger Hour / level stay sample.
    let game;
    try {
      const sbAdmin = getSupabaseAdmin();
      const [lb, st, xp] = await Promise.all([
        weeklyLeaderboard(sbAdmin, name, Date.now()),
        onTimeStreak(sbAdmin, { techId: profile.tech_id, name }, Date.now()),
        techXp(sbAdmin, { techId: profile.tech_id, name }),
      ]);
      const haveRank = lb.available && lb.you;
      if (haveRank || st.available || xp.available) {
        game = { rank: haveRank ? lb.you.rank : 2, rankDelta: 0, streak: st.available ? st.streak : 6, powerHour: 47, level: xp.available ? xp.level : 7, levelPct: xp.available ? xp.pct : 84 };
      }
    } catch (_) {}
    return <TechShell name={name} shells={shells} activeJob={activeJob} wmId={wmId} game={game}>{children}</TechShell>;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - 58px)' }}>
      <Sidebar role={role} name={name} shell={shell} shells={shells} />
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}

import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { resolveShell, switchableShells } from '@/lib/shells';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import Sidebar from './Sidebar';
import TechShell from './TechShell';

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

  // Shell = subdomain (when live) → else the cookie override → else the role default.
  const host = headers().get('host') || '';
  const cookieShell = cookies().get('cb_shell')?.value || '';
  const shell = resolveShell({ host, cookieShell, role, fieldMode: profile.fieldMode, shopMode: profile.shopMode });
  const shells = switchableShells({ role, fieldMode: profile.fieldMode, shopMode: profile.shopMode });

  // Field shell = iPad cockpit chrome (no office sidebar/topbar). Office/Shop = the desktop sidebar.
  if (shell === 'tech') {
    const activeJob = await loadActiveJob(profile.tech_id);
    const wmId = String(user.id || '').replace(/-/g, '').slice(0, 8); // short leak-trace id → maps to this user
    return <TechShell name={name} shells={shells} activeJob={activeJob} wmId={wmId}>{children}</TechShell>;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - 58px)' }}>
      <Sidebar role={role} name={name} shell={shell} shells={shells} />
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}

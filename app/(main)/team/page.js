import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { ROLES, ROLE_IDS } from '@/lib/roles';
import TeamManager from './TeamManager';

export const dynamic = 'force-dynamic';

function ago(iso) {
  if (!iso) return '';
  try {
    const d = (Date.now() - new Date(iso).getTime()) / 86400000;
    if (d < 1) return 'today';
    if (d < 2) return 'yesterday';
    return Math.floor(d) + 'd ago';
  } catch { return ''; }
}

export default async function Team() {
  await requireHref('/team');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">🧑‍✈️ Team</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to manage logins.</div></div>;
  }

  // Role choices for the dropdowns (id, label, short). 'admin' is hidden — 'owner' is the alias.
  const roleOptions = ROLE_IDS.map((id) => ({ id, label: ROLES[id].label, short: ROLES[id].short }));

  // Current logins from Supabase Auth.
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const users = (data?.users || []).map((u) => ({
    id: u.id,
    email: u.email || '',
    name: (u.user_metadata && u.user_metadata.name) || '',
    role: (u.user_metadata && u.user_metadata.role) || 'viewer',
    lastSignIn: ago(u.last_sign_in_at),
  })).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));

  return (
    <div className="wrap">
      <div className="h1">🧑‍✈️ Team</div>
      <p className="muted">Add each person as you hire them and pick their position. Change anyone’s role anytime — it takes effect next time they load a page.</p>
      {error && <div className="notice">Couldn’t load logins: {error.message}</div>}
      <TeamManager roleOptions={roleOptions} users={users} />
    </div>
  );
}

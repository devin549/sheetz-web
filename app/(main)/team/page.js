import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireRole } from '@/lib/guard';
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
  // Office management only (audit P2-1): this page lists every login (emails, roles, sign-in state). Field
  // supervisors (fs/foreman/dispatcher) don't manage logins — restrict to owner/GM/OM/accounting.
  const { role: callerRole } = await requireRole(['owner', 'admin', 'gm', 'om', 'accounting']);

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">🧑‍✈️ Team</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to manage logins.</div></div>;
  }

  // Role choices for the dropdowns (id, label, short). 'admin' is hidden — 'owner' is the alias.
  const roleOptions = ROLE_IDS.map((id) => ({ id, label: ROLES[id].label, short: ROLES[id].short }));

  // Current logins from Supabase Auth.
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });

  // techs (for the tech-link picker + position editor) + profiles (server-authoritative role + tech link)
  let techQ = await sb.from('techs').select('id, name, position, active, phone, supervisor, discord_name').order('name');
  if (techQ.error) techQ = await sb.from('techs').select('id, name, position, active, phone, supervisor').order('name'); // pre-discord
  if (techQ.error) techQ = await sb.from('techs').select('id, name, position, active, phone').order('name'); // pre-64
  if (techQ.error) techQ = await sb.from('techs').select('id, name, position, active').order('name'); // pre-43
  if (techQ.error) techQ = await sb.from('techs').select('id, name').order('name'); // pre-38
  const techs = (techQ.data || []).map((t) => ({ id: t.id, name: t.name, position: t.position || 'tech', active: t.active !== false, phone: t.phone || '', supervisor: t.supervisor || '', discord_name: t.discord_name || '' }));
  // People who can be a supervisor (FS / lead / GM / owner positions), for the dropdown.
  const SUP_POS = new Set(['field_supervisor', 'foreman', 'general_manager', 'owner']);
  const supervisorNames = techs.filter((t) => SUP_POS.has(t.position)).map((t) => t.name);
  const profById = {};
  try { let pQ = await sb.from('profiles').select('user_id, role, tech_id, active, field_mode_enabled, shop_mode_enabled'); if (pQ.error) pQ = await sb.from('profiles').select('user_id, role, tech_id, active'); (pQ.data || []).forEach((p) => { profById[p.user_id] = p; }); } catch (_) {}
  const profilesReady = Object.keys(profById).length > 0;

  const users = (data?.users || []).map((u) => {
    const prof = profById[u.id] || {};
    return {
      id: u.id,
      email: u.email || '',
      name: (u.user_metadata && u.user_metadata.name) || '',
      role: prof.role || (u.user_metadata && u.user_metadata.role) || 'viewer',
      techId: prof.tech_id || '',
      lastSignIn: ago(u.last_sign_in_at),
      active: prof.active !== false && !u.banned_until,
      fieldMode: prof.field_mode_enabled === true,
      shopMode: prof.shop_mode_enabled === true,
    };
  }).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));

  return (
    <div className="wrap">
      <div className="h1">🧑‍✈️ Team</div>
      <p className="muted">Add each person as you hire them and pick their position. Change anyone’s role anytime — it takes effect next time they load a page. Link a tech to their roster row so they see only their own jobs.</p>
      {error && <div className="notice">Couldn’t load logins: {error.message}</div>}
      {!profilesReady && <div className="notice" style={{ fontSize: 12 }}>Roles save to login metadata for now. Run <code>supabase/24_profiles.sql</code> to turn on the profiles table (role + tech link + audit).</div>}
      <TeamManager roleOptions={roleOptions} users={users} techs={techs} supervisorNames={supervisorNames} callerRole={callerRole} />
    </div>
  );
}

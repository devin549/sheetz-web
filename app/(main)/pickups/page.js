import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { loadProfile } from '@/lib/profile';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/roles';
import PickupsClient from './PickupsClient';

export const dynamic = 'force-dynamic';

// Dispatch pickup tray + holder Accept/Problem. Techs see requests aimed at THEM; dispatch/managers see
// the whole tray (who's going where, ETA, whether the next job is affected).
export default async function Pickups() {
  const { role } = await requirePerm('changeStatus', 'seeOwnOnly', 'seeCrew', 'seeAllJobs', 'assignJobs', 'manageInventory');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">🚐 Pickups</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();
  const isDispatch = can(role, 'assignJobs') || can(role, 'manageUsers') || can(role, 'seeCrew') || can(role, 'manageInventory');

  let myTechId = null;
  try { const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); const p = user ? await loadProfile(user) : null; myTechId = p?.tech_id || null; } catch (_) {}

  let rows = [], needsTable = false;
  try {
    const { data, error } = await sb.from('inventory_reservations').select('*').in('status', ['reserved', 'pickup_pending', 'accepted', 'problem']).order('created_at', { ascending: false }).limit(100);
    if (error && /relation|does not exist|schema cache/i.test(error.message || '')) needsTable = true;
    else rows = data || [];
  } catch (_) {}

  // Active job per requester so the tray can flag "next job affected".
  const reqIds = [...new Set(rows.map((r) => r.requested_by).filter(Boolean))];
  const nextJobByTech = {};
  if (reqIds.length) {
    try {
      const { data } = await sb.from('jobs').select('tech_id, job_number, scheduled_at, status').in('status', ['scheduled']).order('scheduled_at', { ascending: true });
      (data || []).forEach((j) => { if (j.tech_id && !nextJobByTech[j.tech_id]) nextJobByTech[j.tech_id] = j; });
    } catch (_) {}
  }

  const mine = myTechId ? rows.filter((r) => String(r.holder_id) === String(myTechId) && ['reserved', 'pickup_pending'].includes(r.status)) : [];
  const tray = rows.map((r) => ({ ...r, nextJob: r.requested_by ? (nextJobByTech[r.requested_by]?.job_number || null) : null }));

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="h1">🚐 Tool &amp; Parts Pickups</div>
      <p className="muted">Live pickups in progress — who’s going for what, where, and the ETA. Holders accept or flag a problem.</p>
      {needsTable && <div className="notice">Run <code>supabase/89_inventory_locate.sql</code> to enable pickups.</div>}
      <PickupsClient mine={mine} tray={tray} isDispatch={isDispatch} />
    </div>
  );
}

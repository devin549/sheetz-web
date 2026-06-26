import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireRole } from '@/lib/guard';
import { FIELD_POSITIONS } from '@/lib/positions';
import { pairingActive, minsToAutoActivate, helperDaySummary } from '@/lib/helpers';
import HelperHome from './HelperHome';

export const dynamic = 'force-dynamic';

export default async function HelperPage() {
  // Helpers live here; managers/owner can open it (field-impersonation / support).
  const { profile } = await requireRole(['helper', 'owner', 'admin', 'gm', 'om', 'fs', 'foreman']);
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">My Day</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();
  const now = Date.now();

  let pairing = null, techs = [], todayWaste = [], openWaste = null, needsTable = false;
  try {
    const { data, error } = await sb.from('helper_pairings').select('*').eq('helper_id', profile.tech_id).in('status', ['active', 'pending']).order('started_at', { ascending: false }).limit(1).maybeSingle();
    if (error && /relation|does not exist|schema cache/i.test(error.message || '')) needsTable = true;
    else pairing = data || null;
  } catch (_) {}

  // pick list — active field techs
  try {
    let q = await sb.from('techs').select('id, name, position, active').limit(500);
    if (q.error) q = await sb.from('techs').select('id, name').limit(500);
    techs = (q.data || []).filter((t) => t.name && t.active !== false && (!t.position || FIELD_POSITIONS.includes(String(t.position).toLowerCase().replace(/\s+/g, '_')))).map((t) => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name));
  } catch (_) {}

  try {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const { data } = await sb.from('helper_waste').select('*').eq('helper_id', profile.tech_id).gte('created_at', startOfDay.toISOString());
    todayWaste = data || [];
    openWaste = todayWaste.find((w) => !w.ended_at) || null;
  } catch (_) {}

  const active = pairingActive(pairing, now);
  const autoMin = minsToAutoActivate(pairing, now);
  const pairedSince = pairing?.started_at ? Math.round((now - Date.parse(pairing.started_at)) / 60000) : 0;
  const summary = helperDaySummary({ waste: todayWaste, pairedMin: pairedSince, now });

  return (
    <div className="wrap" style={{ maxWidth: 520 }}>
      <div className="h1" style={{ fontSize: 20 }}>👋 {profile.name?.split(' ')[0] || 'Helper'}’s day</div>
      {needsTable && <div className="notice">Run <code>supabase/87_job_segments.sql</code> to enable pairing.</div>}
      <HelperHome
        pairing={pairing ? { ...pairing, active, autoMin } : null}
        techs={techs}
        openWaste={openWaste}
        summary={summary}
        deviceHint=""
      />
    </div>
  );
}

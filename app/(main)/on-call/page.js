import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import { FIELD_POSITIONS } from '@/lib/positions';
import { etWeekday, onCallFor } from '@/lib/onCall';
import OnCallClient from './OnCallClient';
import OpenShifts from './OpenShifts';

export const dynamic = 'force-dynamic';
const EDITORS = ['owner', 'admin', 'gm', 'om'];

export default async function OnCall() {
  const { role } = await requireHref('/on-call');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">☎️ On-Call</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const canEdit = EDITORS.includes(String(role || '').toLowerCase());

  let schedule = null, missing = false;
  const sQ = await sb.from('on_call_schedule').select('*').eq('slot', 'current').maybeSingle();
  if (sQ.error && /on_call_schedule|does not exist|schema cache/i.test(sQ.error.message || '')) missing = true;
  else schedule = sQ.data || null;

  // Field-crew names to suggest in the pickers.
  let names = [];
  let tQ = await sb.from('techs').select('name, position, active').limit(500);
  if (tQ.error) tQ = await sb.from('techs').select('name').limit(500);
  if (!tQ.error) names = (tQ.data || []).filter((t) => t.name && t.active !== false && (!t.position || FIELD_POSITIONS.includes(String(t.position).toLowerCase().replace(/\s+/g, '_')))).map((t) => t.name).sort();

  const wd = etWeekday();
  const tonight = onCallFor(schedule, wd === 'Saturday' || wd === 'Sunday' ? 'Friday' : wd);

  // Open-shift / swap board (fail-soft if migration 84 isn't applied yet).
  let offers = [];
  try {
    const oQ = await sb.from('oncall_offers').select('*').order('created_at', { ascending: false }).limit(40);
    if (!oQ.error) offers = oQ.data || [];
  } catch (_) {}

  return (
    <div className="wrap" style={{ maxWidth: 680 }}>
      <div className="h1">☎️ On-Call</div>
      <p className="muted">Who covers after-hours (5pm → 7am). Auto-posts to #sheetz at 4:30pm ET each day — Friday names the weekend.</p>
      {missing && <div className="notice">On-call needs its table — run <code>supabase/65_on_call.sql</code> in Supabase.</div>}
      <OnCallClient schedule={schedule} names={names} canEdit={canEdit} weekday={wd} tonight={tonight} />
      <OpenShifts offers={offers} canEdit={canEdit} />
    </div>
  );
}

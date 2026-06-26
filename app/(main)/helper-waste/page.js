import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { reasonMeta, isTechCaused } from '@/lib/helpers';
import WasteQueue from './WasteQueue';

export const dynamic = 'force-dynamic';
const hm = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h ${m}m` : `${m}m`; };

export default async function HelperWaste() {
  await requirePerm('manageUsers', 'seeReports', 'seeCrew', 'assignJobs');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">Helper Waste</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();

  let rows = [], needsTable = false;
  try {
    const since = new Date(); since.setDate(since.getDate() - 14);
    const { data, error } = await sb.from('helper_waste').select('*').gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(500);
    if (error && /relation|does not exist|schema cache/i.test(error.message || '')) needsTable = true;
    else rows = data || [];
  } catch (_) {}

  const minutesOf = (w) => (Number.isFinite(w.minutes) && w.minutes ? w.minutes : 0);
  // Review queue = tech-caused idle, still undecided.
  const queue = rows.filter((w) => isTechCaused(w.reason) && !w.manager_decision && minutesOf(w) > 0);
  const decided = rows.filter((w) => w.manager_decision).slice(0, 30);

  // Reports: idle by responsible tech, and by reason (last 14 days).
  const byTech = {}; const byReason = {};
  rows.forEach((w) => {
    const m = minutesOf(w);
    if (isTechCaused(w.reason) && (w.lead_tech_name)) byTech[w.lead_tech_name] = (byTech[w.lead_tech_name] || 0) + m;
    byReason[w.reason] = (byReason[w.reason] || 0) + m;
  });
  const techRows = Object.entries(byTech).sort((a, b) => b[1] - a[1]).map(([name, min]) => ({ name, min }));
  const reasonRows = Object.entries(byReason).sort((a, b) => b[1] - a[1]).map(([reason, min]) => ({ reason, label: reasonMeta(reason).label, icon: reasonMeta(reason).icon, min, tech: isTechCaused(reason) }));
  const totalIdle = rows.reduce((s, w) => s + minutesOf(w), 0);
  const techIdle = rows.filter((w) => isTechCaused(w.reason)).reduce((s, w) => s + minutesOf(w), 0);

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <div className="h1">🧑‍🔧 Helper Waste &amp; Accountability</div>
      <p className="muted">Helpers are always paid. This is where tech-caused idle gets reviewed and its cost assigned — never an automatic wage deduction. Last 14 days.</p>
      {needsTable && <div className="notice">Run <code>supabase/87_job_segments.sql</code> to enable waste tracking.</div>}

      <div className="card" style={{ display: 'flex', gap: 22, flexWrap: 'wrap', borderTop: '2px solid var(--amber)' }}>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Total idle (14d)</div><div style={{ fontSize: 24, fontWeight: 800 }}>{hm(totalIdle)}</div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Tech-caused</div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--amber)' }}>{hm(techIdle)}</div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Awaiting review</div><div style={{ fontSize: 24, fontWeight: 800, color: queue.length ? 'var(--red)' : 'var(--green)' }}>{queue.length}</div></div>
      </div>

      <WasteQueue queue={queue.map((w) => ({ ...w, mins: minutesOf(w) }))} decided={decided.map((w) => ({ ...w, mins: minutesOf(w) }))} techRows={techRows} reasonRows={reasonRows} />
    </div>
  );
}

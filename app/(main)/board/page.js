import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';

export const dynamic = 'force-dynamic';

function fmtTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return '—'; }
}
function money(n) { return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }

// Which lane a job belongs in. Unassigned (no tech, not done) gets pulled out first.
function laneOf(j, techName) {
  const s = String(j.status || '').toLowerCase();
  if (/done|complete|closed/.test(s)) return 'done';
  if (!techName) return 'unassigned';
  if (/on_site|onsite/.test(s)) return 'onsite';
  if (/enroute|on_my_way|rolling|en route/.test(s)) return 'enroute';
  return 'scheduled';
}

const LANES = [
  { key: 'unassigned', label: 'Unassigned', icon: '🆕', accent: 'var(--red)' },
  { key: 'scheduled',  label: 'Scheduled',  icon: '📅', accent: 'var(--fg-2)' },
  { key: 'enroute',    label: 'En route',   icon: '🚚', accent: 'var(--amber)' },
  { key: 'onsite',     label: 'On site',    icon: '📍', accent: 'var(--amber)' },
  { key: 'done',       label: 'Done',       icon: '✓',  accent: 'var(--green)' },
];

export default async function Board() {
  await requireHref('/board');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">🗂️ Dispatch Board</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to read jobs.</div></div>;
  }
  const sb = getSupabaseAdmin();

  // Rich select with graceful fallback (08_jobs_dispatch_harden.sql may not be run yet).
  const run = (extra) => sb.from('jobs')
    .select('id, status, priority, scheduled_at' + extra + ', customers(name, address), techs(name)')
    .order('scheduled_at', { ascending: true });
  let res = await run(', job_number, job_type, amount, tech_name');
  if (res.error && /column .* does not exist/i.test(res.error.message || '')) res = await run('');
  const { data: jobs, error } = res;

  // Bucket into lanes.
  const buckets = { unassigned: [], scheduled: [], enroute: [], onsite: [], done: [] };
  let target = 0;
  (jobs || []).forEach((j) => {
    const s = String(j.status || '').toLowerCase();
    if (/cancel/.test(s)) return;
    const techName = (j.techs && j.techs.name) || j.tech_name || '';
    buckets[laneOf(j, techName)].push({ ...j, _tech: techName });
    if (!/done|complete|closed/.test(s)) target += Number(j.amount) || 0;
  });
  const totalOpen = buckets.unassigned.length + buckets.scheduled.length + buckets.enroute.length + buckets.onsite.length;

  return (
    <div className="wrap">
      <div className="h1">🗂️ Dispatch Board</div>
      <p className="muted">
        Live job queue across all techs. <Link href="/my-day">My Day →</Link>
      </p>

      {error && <div className="notice"><strong>Couldn&apos;t load jobs.</strong> {error.message}</div>}

      <div className="card card-amber" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: buckets.unassigned.length ? 'var(--red)' : 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>{buckets.unassigned.length > 0 && <span className="alert-dot" aria-hidden="true" />}{buckets.unassigned.length}</div><div className="muted" style={{ fontSize: 11 }}>unassigned</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--amber)' }}>{buckets.enroute.length + buckets.onsite.length}</div><div className="muted" style={{ fontSize: 11 }}>active</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800 }}>{totalOpen}</div><div className="muted" style={{ fontSize: 11 }}>open jobs</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green-bright)' }}>{money(target)}</div><div className="muted" style={{ fontSize: 11 }}>booked (open)</div></div>
      </div>

      {/* Lanes — horizontal scroll on desktop, comfortable on tablet */}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
        {LANES.map((lane) => {
          const cards = buckets[lane.key];
          return (
            <div key={lane.key} style={{ flex: '0 0 240px', minWidth: 240 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px', borderBottom: `2px solid ${lane.accent}`, marginBottom: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 13 }}>{lane.icon} {lane.label}</span>
                <span className="pill" style={{ fontSize: 11 }}>{cards.length}</span>
              </div>
              {!cards.length && <div className="muted" style={{ fontSize: 11, padding: '8px 4px' }}>—</div>}
              {cards.map((j) => {
                const cust = j.customers || {};
                const urgent = /high|urgent|emergency/i.test(String(j.priority || ''));
                const typeBits = [j.job_type, j.amount ? money(j.amount) : null].filter(Boolean).join(' · ');
                return (
                  <div key={j.id} className="card" style={{ padding: '10px 12px', marginBottom: 8, borderLeft: `3px solid ${lane.accent}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>
                        {urgent && <span className="alert-dot" aria-hidden="true" />}{cust.name || 'Customer'}
                      </span>
                      <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtTime(j.scheduled_at)}</span>
                    </div>
                    {cust.address && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>📍 {cust.address}</div>}
                    {typeBits && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>🔧 {typeBits}</div>}
                    <div style={{ marginTop: 5, fontSize: 11, fontWeight: 700, color: j._tech ? 'var(--fg-2)' : 'var(--red)' }}>
                      {j._tech ? `👷 ${j._tech}` : '⚠ needs a tech'}
                      {j.job_number ? <span className="muted" style={{ fontWeight: 400, fontFamily: 'monospace' }}> · #{j.job_number}</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Read-only live board. Next: drag-drop assign + auto-refresh (Supabase Realtime). Run
        <code> supabase/08_jobs_dispatch_harden.sql</code> to unlock tech assignment + status timestamps.
      </p>
    </div>
  );
}

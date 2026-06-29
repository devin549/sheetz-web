import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { onsiteHours } from '@/lib/hours';

export const dynamic = 'force-dynamic';

// Billable-hours report — management pulls this to see billable hours (on-site time on completed jobs) for
// the ENTIRE company and EACH tech, with revenue and the $/hr it works out to. This is the home for the
// $/hr intelligence we took OFF the tech's My Day card (Devin) — it's a manager view, not a field nudge.
const money = (n) => { const v = Number(n || 0); return v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + Math.round(v); };
const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const RANGES = { week: { days: 7, label: 'Last 7 days' }, month: { days: 30, label: 'Last 30 days' }, quarter: { days: 90, label: 'Last 90 days' } };
const isDone = (s) => /done|complete|closed/.test(String(s || '').toLowerCase());

export default async function BillableHours({ searchParams }) {
  await requirePerm('seeReports', 'seeFinancials', 'seeAllTechs', 'manageUsers');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">⏱ Billable Hours</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const rk = RANGES[searchParams?.range] ? searchParams.range : 'month';
  const { days, label } = RANGES[rk];
  const sinceISO = new Date(Date.now() - days * 86400000).toISOString();

  // Techs (for names/crew) + completed jobs in the window. Column-fallback so a thin schema never 500s.
  let tRes = await sb.from('techs').select('id, name, crew').order('name');
  if (tRes.error) tRes = await sb.from('techs').select('id, name').order('name');
  const techs = (tRes.data || []).map((t) => ({ id: t.id, name: t.name, crew: t.crew || 'Crew' }));
  const techName = {}; techs.forEach((t) => { techName[t.id] = t.name; });

  const run = (extra) => sb.from('jobs').select('id, status, tech_id, tech_name, scheduled_at' + extra).gte('scheduled_at', sinceISO).limit(5000);
  let jRes = await run(', amount, started_at, completed_at');
  if (jRes.error && /column .* does not exist/i.test(jRes.error.message || '')) jRes = await run('');
  const jobs = (jRes.data || []).filter((j) => isDone(j.status)); // billable = completed work

  // Roll up per tech: billable hours (on-site time), revenue, jobs. Key by tech_id, else tech_name.
  const by = {};
  for (const j of jobs) {
    const key = j.tech_id || j.tech_name || 'unassigned';
    const name = techName[j.tech_id] || j.tech_name || 'Unassigned';
    const row = by[key] || (by[key] = { key, name, hours: 0, revenue: 0, jobs: 0 });
    row.hours += onsiteHours(j.started_at, j.completed_at);
    row.revenue += Number(j.amount) || 0;
    row.jobs += 1;
  }
  const rows = Object.values(by)
    .map((r) => ({ ...r, perHr: r.hours > 0 ? r.revenue / r.hours : null }))
    .sort((a, b) => b.hours - a.hours);
  const tot = rows.reduce((a, r) => ({ hours: a.hours + r.hours, revenue: a.revenue + r.revenue, jobs: a.jobs + r.jobs }), { hours: 0, revenue: 0, jobs: 0 });
  const totPerHr = tot.hours > 0 ? tot.revenue / tot.hours : null;

  const Cell = ({ children, l, color, bold }) => <td style={{ padding: '10px 12px', textAlign: l ? 'left' : 'right', color: color || 'var(--fg-1)', fontWeight: bold ? 800 : 500, fontFamily: l ? 'inherit' : 'var(--mono)', whiteSpace: 'nowrap' }}>{children}</td>;
  const Th = ({ children, l }) => <th style={{ padding: '8px 12px', textAlign: l ? 'left' : 'right', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--fg-3)', borderBottom: '1px solid var(--border)' }}>{children}</th>;

  return (
    <div className="wrap" style={{ maxWidth: 920 }}>
      <div className="h1">⏱ Billable Hours</div>
      <p className="muted">On-site time on completed jobs — company total + per tech, with the $/hr it earns. {label}.</p>

      <div style={{ display: 'flex', gap: 6, margin: '4px 0 12px', flexWrap: 'wrap' }}>
        {Object.entries(RANGES).map(([k, v]) => (
          <Link key={k} href={`/billable-hours?range=${k}`} className="pill" style={{ textDecoration: 'none', fontWeight: k === rk ? 800 : 600, background: k === rk ? 'var(--amber)' : 'var(--surface-2)', color: k === rk ? '#1a1206' : 'var(--fg-2)', border: '1px solid var(--border)' }}>{v.label}</Link>
        ))}
      </div>

      {/* Company headline */}
      <div className="card card-amber" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div><div style={{ fontSize: 26, fontWeight: 800, color: 'var(--amber)' }}>{tot.hours.toFixed(1)}</div><div className="muted" style={{ fontSize: 11 }}>company billable hrs</div></div>
        <div><div style={{ fontSize: 26, fontWeight: 800, color: 'var(--green-bright)' }}>{money(tot.revenue)}</div><div className="muted" style={{ fontSize: 11 }}>revenue (completed)</div></div>
        <div><div style={{ fontSize: 26, fontWeight: 800 }}>{totPerHr != null ? money(totPerHr) + '/hr' : '—'}</div><div className="muted" style={{ fontSize: 11 }}>company $/billable hr</div></div>
        <div><div style={{ fontSize: 26, fontWeight: 800 }}>{tot.jobs}</div><div className="muted" style={{ fontSize: 11 }}>jobs</div></div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto', marginTop: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr><Th l>Tech</Th><Th>Jobs</Th><Th>Billable hrs</Th><Th>Revenue</Th><Th>$ / billable hr</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderBottom: '1px solid var(--border)' }}>
                <Cell l><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--amber)', color: '#1a1206', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)' }}>{initials(r.name)}</span><span style={{ fontWeight: 700 }}>{r.name}</span></span></Cell>
                <Cell>{r.jobs}</Cell>
                <Cell bold>{r.hours.toFixed(1)}</Cell>
                <Cell color="var(--green)" bold>{money(r.revenue)}</Cell>
                <Cell color={r.perHr == null ? 'var(--fg-3)' : 'var(--amber)'}>{r.perHr != null ? money(r.perHr) + '/hr' : '—'}</Cell>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} style={{ padding: 16 }}><span className="muted">No completed jobs in this window.</span></td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr style={{ borderTop: '2px solid var(--border-strong)' }}>
              <Cell l bold>Company</Cell><Cell bold>{tot.jobs}</Cell><Cell bold>{tot.hours.toFixed(1)}</Cell><Cell bold color="var(--green)">{money(tot.revenue)}</Cell><Cell bold>{totPerHr != null ? money(totPerHr) + '/hr' : '—'}</Cell>
            </tr></tfoot>
          )}
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Billable hours = on-site time (started → completed) on completed jobs. $/hr = revenue ÷ billable hours. Jobs with no start/finish timestamp count revenue but 0 hours until the timeline fills in.</p>
    </div>
  );
}

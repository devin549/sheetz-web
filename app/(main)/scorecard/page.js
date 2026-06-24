import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { nyTodayStr, nyDayWindow } from '@/lib/day';
import { onsiteHours } from '@/lib/hours';

export const dynamic = 'force-dynamic';

const money = (n) => { const v = Number(n || 0); return v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + Math.round(v); };
const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const crewColor = (n) => ({ 'Drain Team': '#4f9bff', 'Install Crew': '#e0a042', 'HVAC Squad': '#e07a5f' }[n] || '#FF8124');

export default async function Scorecard() {
  await requirePerm('seeAllTechs', 'seeCrew', 'seeReports', 'qaReview');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Staff Scorecard</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const today = nyTodayStr();
  const { startISO, endISO } = nyDayWindow(today);

  let tRes = await sb.from('techs').select('id, name, crew').order('name');
  if (tRes.error) tRes = await sb.from('techs').select('id, name').order('name');
  const techs = (tRes.data || []).map((t) => ({ id: t.id, name: t.name, crew: t.crew || 'Crew' }));

  const run = (extra) => sb.from('jobs').select('id, status, tech_id, scheduled_at' + extra)
    .gte('scheduled_at', startISO).lt('scheduled_at', endISO);
  let jRes = await run(', amount, completed_at, started_at');
  if (jRes.error && /column .* does not exist/i.test(jRes.error.message || '')) jRes = await run('');
  const jobs = (jRes.data || []).filter((j) => !String(j.status || '').toLowerCase().includes('cancel'));

  // QA reviews on today's jobs (guarded — table may be empty/absent)
  const reviewByJob = {};
  const jobIds = jobs.map((j) => j.id);
  if (jobIds.length) {
    const rv = await sb.from('job_photo_reviews').select('job_id, result').in('job_id', jobIds);
    if (!rv.error) (rv.data || []).forEach((r) => { const m = (reviewByJob[r.job_id] = reviewByJob[r.job_id] || { pass: 0, fail: 0 }); m[r.result] = (m[r.result] || 0) + 1; });
  }

  const now = Date.now();
  const isDone = (s) => /done|complete|closed/.test(String(s || '').toLowerCase());
  const isRolling = (s) => /on_site|onsite|enroute|rolling/.test(String(s || '').toLowerCase());

  const rows = techs.map((t) => {
    const mine = jobs.filter((j) => j.tech_id === t.id);
    const done = mine.filter((j) => isDone(j.status)).length;
    const late = mine.filter((j) => !isDone(j.status) && !isRolling(j.status) && j.scheduled_at && new Date(j.scheduled_at).getTime() < now).length;
    const revenue = mine.filter((j) => isDone(j.status)).reduce((s, j) => s + (Number(j.amount) || 0), 0);
    let pass = 0, fail = 0;
    mine.forEach((j) => { const m = reviewByJob[j.id]; if (m) { pass += m.pass || 0; fail += m.fail || 0; } });
    const reviewed = pass + fail;
    const hours = mine.reduce((s, j) => s + onsiteHours(j.started_at, j.completed_at), 0);
    return { t, jobs: mine.length, done, late, revenue, hours, pass, fail, qa: reviewed ? Math.round((pass / reviewed) * 100) : null };
  }).sort((a, b) => b.revenue - a.revenue || b.done - a.done);

  const tot = rows.reduce((a, r) => ({ jobs: a.jobs + r.jobs, done: a.done + r.done, late: a.late + r.late, revenue: a.revenue + r.revenue, hours: a.hours + r.hours }), { jobs: 0, done: 0, late: 0, revenue: 0, hours: 0 });
  const Cell = ({ children, w, color, bold }) => <td style={{ padding: '10px 12px', textAlign: w === 'l' ? 'left' : 'right', color: color || 'var(--fg-1)', fontWeight: bold ? 800 : 500, fontFamily: w === 'l' ? 'inherit' : 'var(--mono)', whiteSpace: 'nowrap' }}>{children}</td>;
  const Th = ({ children, l }) => <th style={{ padding: '8px 12px', textAlign: l ? 'left' : 'right', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--fg-3)', borderBottom: '1px solid var(--border)' }}>{children}</th>;

  return (
    <div className="wrap" style={{ maxWidth: 920 }}>
      <div className="h1">Staff Scorecard</div>
      <p className="muted">Today ({today}) · live from jobs + QA. Sorted by revenue.</p>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr>
            <Th l>Tech</Th><Th>Jobs</Th><Th>Done</Th><Th>Late</Th><Th>Hours</Th><Th>Revenue</Th><Th>QA pass</Th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <Cell w="l">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: crewColor(r.t.crew), color: '#fff', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)' }}>{initials(r.t.name)}</span>
                    <span style={{ fontWeight: 700 }}>{r.t.name}</span>
                    <span className="muted" style={{ fontSize: 11 }}>{r.t.crew}</span>
                  </span>
                </Cell>
                <Cell>{r.jobs}</Cell>
                <Cell color="var(--green)" bold>{r.done}</Cell>
                <Cell color={r.late ? 'var(--red)' : 'var(--fg-3)'} bold={!!r.late}>{r.late || '—'}</Cell>
                <Cell color="var(--fg-3)">{r.hours ? r.hours.toFixed(1) : '—'}</Cell>
                <Cell bold>{money(r.revenue)}</Cell>
                <Cell color={r.qa == null ? 'var(--fg-3)' : r.qa >= 80 ? 'var(--green)' : 'var(--amber)'}>{r.qa == null ? '—' : r.qa + '%'}</Cell>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} style={{ padding: 16 }}><span className="muted">No techs yet.</span></td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr style={{ borderTop: '2px solid var(--border-strong)' }}>
              <Cell w="l" bold>Team</Cell><Cell bold>{tot.jobs}</Cell><Cell bold color="var(--green)">{tot.done}</Cell>
              <Cell bold color={tot.late ? 'var(--red)' : 'var(--fg-3)'}>{tot.late || '—'}</Cell><Cell color="var(--fg-3)">{tot.hours ? tot.hours.toFixed(1) : '—'}</Cell><Cell bold>{money(tot.revenue)}</Cell><Cell>—</Cell>
            </tr></tfoot>
          )}
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>QA pass % fills in as supervisors review job photos. Revenue counts completed jobs today.</p>
    </div>
  );
}

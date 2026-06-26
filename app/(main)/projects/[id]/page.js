import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { loadProject, money } from '@/lib/projects';
import AddUnit from './AddUnit';

export const dynamic = 'force-dynamic';
const fmt = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return ''; } };
const STATUS = { active: 'var(--green)', on_hold: 'var(--amber)', done: 'var(--fg-3)', cancelled: 'var(--red)' };

function VisitRow({ v }) {
  const done = /done|complete|closed/.test(String(v.status || '').toLowerCase());
  return (
    <Link href={`/job/${v.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--amber)', minWidth: 56 }}>{fmt(v.scheduled_at)}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>{v.job_type || 'Visit'}</span>
      <span className="pill" style={{ fontSize: 9, color: done ? 'var(--green)' : 'var(--fg-3)' }}>{String(v.status || 'scheduled').toUpperCase()}</span>
      {v.amount != null && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 12 }}>{money(v.amount)}</span>}
    </Link>
  );
}

export default async function ProjectDetail({ params }) {
  await requirePerm('createJobs', 'assignJobs', 'seeQueue', 'seeAllJobs', 'manageUsers');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">Project</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();
  const data = await loadProject(sb, params.id);
  if (!data) notFound();
  const { project, payer, units, byUnit, unassigned, visits, margin } = data;
  const mc = margin.marginPct == null ? 'var(--fg-3)' : margin.marginPct >= 59 ? 'var(--green)' : margin.marginPct >= 40 ? 'var(--amber)' : 'var(--red)';

  return (
    <div className="wrap" style={{ maxWidth: 920 }}>
      <Link href="/projects" className="muted" style={{ fontSize: 12 }}>← Projects</Link>

      <div className="card card-amber" style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span className="h1" style={{ margin: 0 }}>🏗️ {project.name}</span>
          <span className="pill" style={{ color: STATUS[project.status], border: `1px solid ${STATUS[project.status]}` }}>{project.status === 'on_hold' ? `On hold${project.hold_reason ? ` · ${project.hold_reason}` : ''}` : project.status}</span>
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          {payer ? <>Payer: <strong style={{ color: 'var(--fg-2)' }}>{payer.name}</strong> · </> : ''}{project.site_address || 'no site address'}
          {project.target_completion ? ` · target ${fmt(project.target_completion)}` : ''}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8, marginTop: 12 }}>
          {[['Revenue', money(margin.revenue), 'var(--green-bright)'], ['Cost', money(margin.cost), 'var(--fg-2)'], ['Margin', margin.marginPct == null ? '—' : `${margin.marginPct}%`, mc], ['Units', units.length, 'var(--fg-1)'], ['Visits', visits.length, 'var(--fg-1)']].map(([l, v, c]) => (
            <div key={l} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 17, fontWeight: 800, color: c }}>{v}</div>
              <div className="muted" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <AddUnit projectId={project.id} nextSort={units.length} />

      {/* Units → their visits */}
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {units.map((u) => (
          <div key={u.id} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 800 }}>🏠 {u.label}</span>
              <span className="pill" style={{ fontSize: 9 }}>{u.status}</span>
              <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{(byUnit[u.id] || []).length} visit(s)</span>
            </div>
            {(byUnit[u.id] || []).length ? <div style={{ display: 'grid', gap: 5 }}>{(byUnit[u.id] || []).map((v) => <VisitRow key={v.id} v={v} />)}</div>
              : <span className="muted" style={{ fontSize: 12 }}>No visits linked yet. On any job, set its project + unit to add it here.</span>}
          </div>
        ))}
        {units.length === 0 && <div className="card"><span className="muted">No units yet — add the apartments/areas above (Apt 101, 102…).</span></div>}

        {unassigned.length > 0 && (
          <div className="card" style={{ borderLeft: '3px solid var(--amber)' }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>📦 Visits not yet assigned to a unit</div>
            <div style={{ display: 'grid', gap: 5 }}>{unassigned.map((v) => <VisitRow key={v.id} v={v} />)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

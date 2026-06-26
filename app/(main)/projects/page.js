import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { loadProjects, money } from '@/lib/projects';
import NewProject from './NewProject';

export const dynamic = 'force-dynamic';

const STATUS = { active: { c: 'var(--green)', l: 'Active' }, on_hold: { c: 'var(--amber)', l: 'On hold' }, done: { c: 'var(--fg-3)', l: 'Done' }, cancelled: { c: 'var(--red)', l: 'Cancelled' } };

export default async function Projects() {
  await requirePerm('createJobs', 'assignJobs', 'seeQueue', 'seeAllJobs', 'manageUsers');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">Projects</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();
  const { available, rows } = await loadProjects(sb);

  return (
    <div className="wrap" style={{ maxWidth: 920 }}>
      <div className="h1">🏗️ Projects</div>
      <p className="muted">Multi-unit / multi-visit jobs — one site, one payer, many units. Margin rolls up across every visit.</p>

      {!available && <div className="notice">Run <code>supabase/80_projects.sql</code> to turn on Projects.</div>}

      <NewProject />

      {available && rows.length === 0 && <div className="card" style={{ marginTop: 10 }}><span className="muted">No projects yet — start one above (e.g. a contractor doing a whole apartment building).</span></div>}

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {rows.map((p) => {
          const st = STATUS[p.status] || STATUS.active;
          const mc = p.marginPct == null ? 'var(--fg-3)' : p.marginPct >= 59 ? 'var(--green)' : p.marginPct >= 40 ? 'var(--amber)' : 'var(--red)';
          return (
            <Link key={p.id} href={`/projects/${p.id}`} className="card card-amber" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 16 }}>{p.name}</span>
                <span className="pill" style={{ color: st.c, border: `1px solid ${st.c}` }}>{st.l}</span>
                <span className="muted" style={{ fontSize: 12 }}>· {p.payer}</span>
                <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, color: mc }}>{p.marginPct == null ? '—' : `${p.marginPct}% margin`}</span>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{p.site_address || 'no site address'} · {p.visits} visit{p.visits === 1 ? '' : 's'} · {money(p.revenue)} booked</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

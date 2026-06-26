'use client';

// 🔔 Project radar — manager-facing. The system surfaces likely projects (a site with 3+ loose jobs) and
// tech-flagged jobs; the manager verifies and converts with one click. No tech ever moves a job directly.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createProjectFromCandidate } from './actions';

export default function ProjectRadar({ candidates = [], flagged = [] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [names, setNames] = useState({});
  const [busy, setBusy] = useState(null);

  const convert = (key, payload) => { setBusy(key); start(async () => { const r = await createProjectFromCandidate(payload); setBusy(null); if (r.ok) router.push(`/projects/${r.id}`); }); };

  if (!candidates.length && !flagged.length) return null;
  const row = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', flexWrap: 'wrap' };
  const nameInp = { flex: '1 1 160px', minWidth: 120, background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '7px 9px', fontSize: 13 };
  const cta = { background: 'var(--amber)', color: '#1a1206', border: 'none', borderRadius: 8, padding: '7px 12px', fontWeight: 800, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' };

  return (
    <div className="card" style={{ marginTop: 12, borderLeft: '3px solid var(--amber)' }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 2 }}>🔔 Project radar</div>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>The system flagged these for you to verify — confirm to turn them into a project (techs can’t move jobs themselves).</div>

      {flagged.length > 0 && (
        <div style={{ marginBottom: candidates.length ? 12 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Flagged by a tech</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {flagged.map((f) => (
              <div key={f.jobId} style={row}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{f.name}{f.jobType ? <span className="muted" style={{ fontWeight: 400 }}> · {f.jobType}</span> : ''}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{f.address}{f.by ? ` · flagged by ${f.by}` : ''}{f.note ? ` — “${f.note}”` : ''}</div>
                </div>
                <a href={`/job/${f.jobId}`} className="pill" style={{ color: 'var(--amber)' }}>open job</a>
                <button style={cta} disabled={pending} onClick={() => convert('f' + f.jobId, { name: f.name, customerId: f.customerId, siteAddress: f.address, jobIds: [f.jobId] })}>{busy === 'f' + f.jobId ? '…' : 'Make a project →'}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {candidates.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Sites with repeat jobs</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {candidates.map((c) => (
              <div key={c.customerId} style={row}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{c.name} <span className="pill" style={{ fontSize: 9, color: 'var(--amber)' }}>{c.count} jobs</span></div>
                  <div className="muted" style={{ fontSize: 11 }}>{c.address}{c.recentTypes.length ? ` · ${c.recentTypes.join(', ')}` : ''}</div>
                </div>
                <input value={names[c.customerId] ?? c.name} onChange={(e) => setNames((n) => ({ ...n, [c.customerId]: e.target.value }))} style={nameInp} placeholder="Project name" />
                <button style={cta} disabled={pending} onClick={() => convert('c' + c.customerId, { name: names[c.customerId] ?? c.name, customerId: c.customerId, siteAddress: c.address, jobIds: c.jobIds })}>{busy === 'c' + c.customerId ? '…' : 'Make a project →'}</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

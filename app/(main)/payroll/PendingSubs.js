'use client';

// Accounting verifies subcontractor costs here. A sub is "pending" until verified; the tech's pay shows
// the number flagged until then. Verifying confirms the invoice → the cost finalizes (at cost, no markup).
import { useState, useTransition } from 'react';
import { verifyJobSub } from '../job/[id]/actions';

export default function PendingSubs({ subs: initial }) {
  const [subs, setSubs] = useState(initial || []);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState(null);
  if (!subs.length) return null;
  const verify = (id) => { setBusyId(id); start(async () => { const r = await verifyJobSub(id); if (r?.ok) setSubs((s) => s.filter((x) => x.id !== id)); setBusyId(null); }); };
  const total = subs.reduce((s, x) => s + (Number(x.sub_cost_cents) || 0), 0);
  return (
    <div className="card" style={{ marginBottom: 14, borderLeft: '3px solid #ff8a3d' }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>👷 Subcontractor costs pending verification <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {subs.length} · ${(total / 100).toLocaleString()}</span></div>
      <div style={{ display: 'grid', gap: 7 }}>
        {subs.map((j) => (
          <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{j.sub_vendor || 'Subcontractor'} · ${((j.sub_cost_cents || 0) / 100).toLocaleString()}</div>
              <div className="muted" style={{ fontSize: 11 }}>{(j.customers && j.customers.name) || 'Customer'}{j.job_number ? ` · #${j.job_number}` : ''}{j.tech_name ? ` · ${j.tech_name}` : ''}</div>
            </div>
            <a href={`/job/${j.id}`} className="btn btn-ghost" style={{ fontSize: 12 }}>View</a>
            <button onClick={() => verify(j.id)} disabled={pending && busyId === j.id} className="btn" style={{ fontSize: 12, opacity: pending && busyId === j.id ? 0.6 : 1 }}>{pending && busyId === j.id ? '…' : '✓ Verify'}</button>
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 10.5, marginTop: 8 }}>Verifying confirms the invoice — the cost finalizes in the tech's pay (at cost, no markup).</div>
    </div>
  );
}

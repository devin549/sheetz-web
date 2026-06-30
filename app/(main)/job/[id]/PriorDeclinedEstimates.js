'use client';

// 🚫 What this CUSTOMER has been offered before and turned down — across all their jobs. Surfaces on the job
// overview so when they call back the office/tech can say "we offered that on <date>, you declined" — the
// customer can't claim it was never offered. Collapsible; defaults open since it's the whole point.
import { useState } from 'react';

const money = (n) => '$' + (Number(n) || 0).toLocaleString();
const fmtD = (s) => { try { return new Date(s).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };

export default function PriorDeclinedEstimates({ items = [] }) {
  const [open, setOpen] = useState(true);
  if (!items.length) return null;
  return (
    <div className="card" style={{ marginTop: 10, borderLeft: '3px solid var(--red)', background: 'color-mix(in oklab, var(--red) 5%, var(--surface-1))' }}>
      <button onClick={() => setOpen((o) => !o)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box' }}>
        <span style={{ fontSize: 16 }}>🚫</span>
        <span style={{ fontWeight: 800, fontSize: 13.5 }}>Declined before — {items.length} estimate{items.length === 1 ? '' : 's'}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--fg-3)', fontSize: 12 }}>{open ? '▲ hide' : '▼ show'}</span>
      </button>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>What we’ve offered this customer and they turned down — so they can’t say it wasn’t offered. Bring it up again.</div>
      {open && (
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          {items.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, padding: '7px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 700 }}>{e.headline || 'Estimate'}</span>
              <span style={{ color: 'var(--green)', fontWeight: 700 }}>{money(e.subtotal)}</span>
              <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>declined {fmtD(e.responded_at || e.created_at)}{e.job_number ? ` · #${e.job_number}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

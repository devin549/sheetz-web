'use client';

// 🔎 Quick find any saved unit by brand — type "Rheem" and see every one on file + which customer it's at.
// Fast recall for parts/warranty when you're standing in front of a unit. Reads the equipment registry.
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { searchEquipmentByBrand } from './equipActions';

const inp = { flex: 1, minWidth: 0, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 };

export default function EquipmentFinder() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();
  const find = () => { if (q.trim().length < 2) return; setMsg(null); start(async () => { const r = await searchEquipmentByBrand(q); if (r.ok) { setRes(r.results); setMsg(r.results.length ? null : 'No saved units match that.'); } else setMsg(r.msg); }); };

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>🔎 Find a unit by brand</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={q} onChange={(e) => { setQ(e.target.value); setRes(null); }} onKeyDown={(e) => { if (e.key === 'Enter') find(); }} placeholder="Brand / model / serial — e.g. Rheem" style={inp} />
        <button onClick={find} disabled={pending || q.trim().length < 2} className="btn" style={{ opacity: (pending || q.trim().length < 2) ? 0.6 : 1, whiteSpace: 'nowrap' }}>{pending ? '…' : 'Search'}</button>
      </div>
      {msg && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{msg}</div>}
      {res && res.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          {res.map((e) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{[e.brand, e.model].filter(Boolean).join(' ') || e.type}</span>
              <span className="muted" style={{ fontSize: 11.5 }}>{[e.type, e.year, e.fuel && e.fuel !== 'UNKNOWN' ? e.fuel : null].filter(Boolean).join(' · ')}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12 }}>{e.customer || 'Customer'}{e.customerId ? <Link href={`/customers/${e.customerId}`} className="pill" style={{ marginLeft: 6 }}>open →</Link> : null}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

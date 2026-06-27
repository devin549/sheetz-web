'use client';

// 🔍 Truck-Wide Search — find a part across the shops + every tech's van, inline. Shop hits get a Pickup
// (Maps) link; another tech's van gets a Request-transfer (posts to the team chat). Ports the gold
// pane-tools search; the deeper drive-time-ranked locator still lives one tap away at /tools.
import { useState, useTransition } from 'react';
import { truckWideSearch, requestPartTransfer } from './truckActions';
import { shopLabel, shopAddress, mapsDir } from '@/lib/shops';

export default function TruckWideSearch() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [note, setNote] = useState(null);
  const [pending, start] = useTransition();

  const search = (e) => { e.preventDefault(); const v = q.trim(); if (v.length < 2) return; setNote(null); start(async () => { const r = await truckWideSearch(v); setRes(r.ok ? r : { shops: [], vans: [] }); }); };
  const transfer = (part, fromTech) => start(async () => { const r = await requestPartTransfer({ part, qty: 1, fromTech }); setNote(r); });

  const card = { background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px', marginBottom: 6, display: 'grid', gridTemplateColumns: '28px 1fr auto auto', gap: 10, alignItems: 'center' };

  return (
    <div>
      <form onSubmit={search} className="card" style={{ borderLeft: '3px solid var(--amber)', marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>🔍 Find any part fleet-wide</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus inputMode="search" placeholder='e.g. "wax ring" or "Bradford White 50gal"'
            style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '11px 12px', fontSize: 14, color: 'var(--fg-1)' }} />
          <button type="submit" className="btn" disabled={pending} style={{ whiteSpace: 'nowrap' }}>{pending ? '…' : 'Search'}</button>
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Who has it · which shop · request a transfer if it’s on another tech’s van.</div>
      </form>

      {note && <div style={{ fontSize: 12.5, fontWeight: 700, color: note.ok ? 'var(--green)' : 'var(--red)', marginBottom: 8 }}>{note.msg}</div>}

      {res && (res.shops.length + res.vans.length === 0) && (
        <div className="card"><span className="muted">No match on the shops or any van. Try a different term, or open the full locator below.</span></div>
      )}

      {res?.shops.map((s, i) => {
        const addr = shopAddress(s.location_id), dir = mapsDir(addr);
        return (
          <div key={'s' + i} style={{ ...card, borderColor: '#4caf50' }}>
            <span style={{ fontSize: 22 }}>🏪</span>
            <div><div style={{ fontSize: 13, fontWeight: 700 }}>{shopLabel(s.location_id)}</div><div className="muted" style={{ fontSize: 10 }}>{s.name}{s.bin ? ` · bin ${s.bin}` : ''}</div></div>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--green-bright)', fontWeight: 800, whiteSpace: 'nowrap' }}>{s.qty} in stock</span>
            {dir ? <a href={dir} target="_blank" rel="noreferrer" className="btn" style={{ textDecoration: 'none', fontSize: 11 }}>🚗 Pickup</a> : <span className="muted" style={{ fontSize: 10 }}>—</span>}
          </div>
        );
      })}

      {res?.vans.map((v, i) => (
        <div key={'v' + i} style={{ ...card, borderColor: 'var(--amber-dim)' }}>
          <span style={{ fontSize: 22 }}>🚐</span>
          <div><div style={{ fontSize: 13, fontWeight: 700 }}>{v.mine ? 'Your van' : `${v.tech_name}’s van`}</div><div className="muted" style={{ fontSize: 10 }}>{v.name}{v.bin ? ` · ${v.bin}` : ''}</div></div>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)', fontWeight: 800, whiteSpace: 'nowrap' }}>{v.qty} on van</span>
          {v.mine ? <span style={{ fontSize: 10, color: 'var(--green-bright)', fontWeight: 700 }}>✓ yours</span>
            : <button onClick={() => transfer(v.name, v.tech_name)} disabled={pending} className="btn btn-ghost" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>🔄 Transfer</button>}
        </div>
      ))}
    </div>
  );
}

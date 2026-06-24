'use client';

import { useState } from 'react';
import { fergusonSearch, saveFergusonPrice } from './actions';
import { Search, ExternalLink, Bookmark } from 'lucide-react';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FergusonClient() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState(null);
  const [saved, setSaved] = useState({});

  async function go(e) {
    e && e.preventDefault();
    if (q.trim().length < 3) { setMsg('Type a part name or SKU.'); return; }
    setMsg(null); setRes(null); setSaved({}); setBusy(true);
    const r = await fergusonSearch(q);
    setBusy(false);
    if (r.ok) { setRes(r); if (r.msg) setMsg(r.msg); } else setMsg(r.msg);
  }
  async function save(price, i) {
    const fd = new FormData(); fd.set('item', q); fd.set('price', String(price));
    const r = await saveFergusonPrice(fd);
    if (r.ok) setSaved((s) => ({ ...s, [i]: true })); else setMsg(r.msg);
  }

  return (
    <>
      <form onSubmit={go} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: '1 1 280px' }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 12, color: 'var(--fg-3)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 3/4 PEX ball valve, or a model #" autoComplete="off"
            style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 11px 10px 33px', fontSize: 14 }} />
        </div>
        <button type="submit" className="btn" disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: busy ? 0.6 : 1 }}><Search size={15} className={busy ? 'cb-spin' : ''} /> {busy ? 'Searching…' : 'Search Ferguson'}</button>
      </form>
      {msg && <div style={{ fontSize: 13, color: res ? 'var(--fg-2)' : 'var(--red)', fontWeight: 600, marginBottom: 8 }}>{msg}</div>}

      {res && res.priced && res.priced.length > 0 && (
        <>
          <h3 style={{ fontSize: 12, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '6px 0 8px' }}>Priced at Ferguson</h3>
          <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
            {res.priced.map((r, i) => (
              <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 14, minWidth: 70 }}>{money(r.price)}</span>
                <span className="muted" style={{ flex: '1 1 160px', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                {r.link && <a href={r.link} target="_blank" rel="noopener noreferrer" className="muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3 }}><ExternalLink size={12} /> open</a>}
                <button type="button" onClick={() => save(r.price, i)} disabled={saved[i]} className="pill" style={{ cursor: saved[i] ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, color: saved[i] ? 'var(--green)' : 'var(--fg-2)' }}><Bookmark size={12} /> {saved[i] ? 'saved' : 'to book'}</button>
              </div>
            ))}
          </div>
        </>
      )}

      {res && res.catalog && res.catalog.length > 0 && (
        <>
          <h3 style={{ fontSize: 12, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '6px 0 8px' }}>Ferguson catalog</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {res.catalog.map((c, i) => (
              <a key={i} href={c.link} target="_blank" rel="noopener noreferrer" className="card" style={{ padding: '9px 13px', textDecoration: 'none', color: 'inherit', display: 'block' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}><ExternalLink size={12} style={{ color: 'var(--fg-3)' }} /> {c.title}</div>
                {c.snippet && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{c.snippet}</div>}
              </a>
            ))}
          </div>
        </>
      )}
    </>
  );
}

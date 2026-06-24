'use client';

import { useState } from 'react';
import { findPrices, saveMarketPrice } from './actions';
import { Search, ExternalLink, TrendingDown, Bookmark } from 'lucide-react';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BulkBuyClient() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState(null);
  const [saved, setSaved] = useState({});

  async function go(e) {
    e && e.preventDefault();
    if (q.trim().length < 3) { setMsg('Type a part name or SKU.'); return; }
    setMsg(null); setRes(null); setSaved({}); setBusy(true);
    const r = await findPrices(q);
    setBusy(false);
    if (r.ok) setRes(r); else setMsg(r.msg);
  }
  async function save(item, merchant, price, i) {
    const fd = new FormData(); fd.set('item', item); fd.set('merchant', merchant); fd.set('price', String(price));
    const r = await saveMarketPrice(fd);
    if (r.ok) setSaved((s) => ({ ...s, [i]: true })); else setMsg(r.msg);
  }

  const marketLow = res && res.results.length ? res.results[0].price : null;
  const ourLow = res && res.ourPrices.length ? Math.min(...res.ourPrices.map((p) => p.price_cents)) / 100 : null;
  const ourLowRow = res && res.ourPrices.length ? res.ourPrices.reduce((a, b) => (b.price_cents < a.price_cents ? b : a)) : null;
  const savings = (ourLow != null && marketLow != null) ? ourLow - marketLow : null;

  return (
    <>
      <form onSubmit={go} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: '1 1 280px' }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 12, color: 'var(--fg-3)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. AO Smith 50 gal gas water heater, or a SKU" autoComplete="off"
            style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 11px 10px 33px', fontSize: 14 }} />
        </div>
        <button type="submit" className="btn" disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: busy ? 0.6 : 1 }}><Search size={15} className={busy ? 'cb-spin' : ''} /> {busy ? 'Shopping…' : 'Find best price'}</button>
      </form>
      {msg && <div style={{ fontSize: 13, color: 'var(--red)', fontWeight: 700, marginBottom: 8 }}>{msg}</div>}

      {res && (
        <>
          {/* verdict */}
          <div className="card card-amber" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <div><div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Market low</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{marketLow != null ? money(marketLow) : '—'}</div><div className="muted" style={{ fontSize: 11 }}>{res.results[0] ? res.results[0].merchant : 'no results'}</div></div>
            <div><div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>You pay</div><div style={{ fontSize: 22, fontWeight: 800 }}>{ourLow != null ? money(ourLow) : '—'}</div><div className="muted" style={{ fontSize: 11 }}>{ourLowRow ? ourLowRow.vendor_name : 'not in price book'}</div></div>
            {savings != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingDown size={20} style={{ color: savings > 0 ? 'var(--green)' : 'var(--fg-3)' }} />
                <div><div style={{ fontSize: 20, fontWeight: 800, color: savings > 0 ? 'var(--green)' : 'var(--fg-2)' }}>{savings > 0 ? `Save ${money(savings)}` : (savings < 0 ? `You're ${money(-savings)} under` : 'Same')}</div><div className="muted" style={{ fontSize: 11 }}>per unit vs your book</div></div>
              </div>
            )}
          </div>

          {/* market results */}
          {!res.results.length && <div className="card"><span className="muted">No shopping results — try a broader term.</span></div>}
          <div style={{ display: 'grid', gap: 6 }}>
            {res.results.map((r, i) => (
              <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: i === 0 ? 'var(--green)' : 'var(--fg-1)', minWidth: 70 }}>{money(r.price)}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 110 }}>{r.merchant}</span>
                <span className="muted" style={{ flex: '1 1 160px', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                {r.link && <a href={r.link} target="_blank" rel="noopener noreferrer" className="muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3 }}><ExternalLink size={12} /> open</a>}
                <button type="button" onClick={() => save(q, r.merchant, r.price, i)} disabled={saved[i]} className="pill" style={{ cursor: saved[i] ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, color: saved[i] ? 'var(--green)' : 'var(--fg-2)' }}><Bookmark size={12} /> {saved[i] ? 'saved' : 'to book'}</button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

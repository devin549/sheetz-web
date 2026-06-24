'use client';

import { useState } from 'react';
import { scanCompetitorPricing } from './actions';
import { DollarSign, Search, Star } from 'lucide-react';

const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString();
const shortLoc = (loc) => String(loc || '').replace(', United States', '').replace(', Kentucky', ', KY');

export default function PricingRadar({ competitors = [], markets = [], cbAvg = [], recent = [] }) {
  const [comp, setComp] = useState('');
  const [market, setMarket] = useState(markets[0] || '');
  const [monthsBack, setMonthsBack] = useState(4);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [result, setResult] = useState(null);

  async function scan() {
    if (!comp.trim()) { setMsg({ ok: false, t: 'Enter a competitor name.' }); return; }
    setMsg(null); setResult(null); setBusy(true);
    const r = await scanCompetitorPricing(comp, market, monthsBack);
    setBusy(false);
    if (r.ok) { setResult(r); if (!r.points.length) setMsg({ ok: true, t: `No prices mentioned in ${r.reviewsScanned} recent reviews — try another competitor.` }); }
    else setMsg({ ok: false, t: r.msg });
  }

  return (
    <div style={{ marginTop: 22 }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}><DollarSign size={15} style={{ color: 'var(--amber)' }} /> Pricing radar</h3>
      <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>Mine a competitor&apos;s Google reviews for prices customers mention, read against your average ticket.</p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <input value={comp} onChange={(e) => setComp(e.target.value)} list="pr-comps" placeholder="Competitor (e.g. Dauenhauer Plumbing)" autoComplete="off"
          style={{ flex: '1 1 240px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 }} />
        <datalist id="pr-comps">{competitors.map((c) => <option key={c} value={c} />)}</datalist>
        {markets.length > 0 && (
          <select value={market} onChange={(e) => setMarket(e.target.value)} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 }}>
            {markets.map((m) => <option key={m} value={m}>{shortLoc(m)}</option>)}
          </select>
        )}
        <select value={monthsBack} onChange={(e) => setMonthsBack(Number(e.target.value))} title="How far back to read reviews" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 }}>
          <option value={1}>1 mo</option>
          <option value={4}>4 mo</option>
          <option value={6}>6 mo</option>
        </select>
        <button type="button" className="btn" onClick={scan} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: busy ? 0.6 : 1 }}>
          <Search size={15} className={busy ? 'cb-spin' : ''} /> {busy ? 'Mining…' : 'Scan pricing'}
        </button>
      </div>
      {msg && <div style={{ fontSize: 12.5, fontWeight: 700, color: msg.ok ? 'var(--fg-2)' : 'var(--red)', marginBottom: 8 }}>{msg.t}</div>}

      {result && result.market_read && (
        <div className="card card-amber" style={{ padding: '11px 13px', marginBottom: 10, fontSize: 13 }}>📊 {result.market_read}</div>
      )}

      {result && result.points && result.points.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          {result.points.map((p, i) => (
            <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, flex: '0 0 auto' }}>{money(p.price)}</span>
              <span style={{ flex: '1 1 130px', fontSize: 13 }}>{p.service || '—'}</span>
              {p.rating != null && <span style={{ fontSize: 12, color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: 2 }}><Star size={12} fill="currentColor" /> {p.rating}</span>}
              <span className="muted" style={{ flex: '1 1 100%', fontSize: 11.5, fontStyle: 'italic' }}>“{p.quote}”</span>
            </div>
          ))}
        </div>
      )}

      {/* CB baseline */}
      {cbAvg.length > 0 && (
        <details style={{ marginBottom: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--fg-2)' }}>Your average tickets (baseline)</summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {cbAvg.map((c) => (
              <span key={c.service} className="card" style={{ padding: '6px 10px', fontSize: 12 }}><strong>{money(c.avg)}</strong> <span className="muted">{c.service} · {c.jobs} jobs</span></span>
            ))}
          </div>
        </details>
      )}

      {recent.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--fg-2)' }}>Saved competitor prices ({recent.length})</summary>
          <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
            {recent.map((r, i) => (
              <div key={i} className="card" style={{ display: 'flex', gap: 10, padding: '7px 11px', fontSize: 12.5, flexWrap: 'wrap' }}>
                <strong>{money((r.price_cents || 0) / 100)}</strong>
                <span>{r.competitor}</span>
                <span className="muted">{r.service}{r.location ? ` · ${shortLoc(r.location)}` : ''}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

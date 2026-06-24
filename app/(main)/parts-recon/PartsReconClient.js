'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recordCount } from './actions';

const input = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 10px', fontSize: 14, fontFamily: 'inherit' };
const label = { fontSize: 10.5, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 3 };
const dt = (s) => { try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };

function vBadge(v) {
  if (v === 0) return { t: 'match', c: 'var(--green)' };
  if (v < 0) return { t: `short ${Math.abs(v)}`, c: 'var(--red)' };
  return { t: `+${v}`, c: 'var(--amber)' };
}

export default function PartsReconClient({ counts, items }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [item, setItem] = useState('');
  const [sysQ, setSysQ] = useState('');
  const [msg, setMsg] = useState(null);

  function pickItem(v) { setItem(v); const m = items.find((x) => x.name === v); if (m) setSysQ(String(m.qty)); }
  function submit(e) {
    e.preventDefault(); const form = e.currentTarget; setMsg(null);
    start(async () => { const r = await recordCount(new FormData(form)); setMsg(r); if (r.ok) { form.reset(); setItem(''); setSysQ(''); router.refresh(); } });
  }

  const stats = useMemo(() => {
    const shrink = counts.filter((c) => c.variance < 0);
    const net = counts.reduce((s, c) => s + (c.variance || 0), 0);
    return { total: counts.length, shrink: shrink.length, net };
  }, [counts]);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '4px 0 14px' }}>
        {[
          { k: 'Counts logged', v: String(stats.total) },
          { k: 'Shrink lines', v: String(stats.shrink), c: stats.shrink ? 'var(--red)' : 'var(--green)' },
          { k: 'Net variance', v: (stats.net > 0 ? '+' : '') + stats.net, c: stats.net < 0 ? 'var(--red)' : (stats.net > 0 ? 'var(--amber)' : 'var(--green)') },
        ].map((c) => (
          <div key={c.k} className="card" style={{ padding: '12px 14px' }}>
            <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{c.k}</div>
            <div style={{ fontSize: 23, fontWeight: 800, color: c.c || 'var(--amber)', marginTop: 2 }}>{c.v}</div>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="card card-amber" style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
          <div><span style={label}>Item *</span><input name="item" value={item} onChange={(e) => pickItem(e.target.value)} list="pr-items" placeholder="part" style={input} required autoComplete="off" /><datalist id="pr-items">{items.map((i) => <option key={i.name} value={i.name} />)}</datalist></div>
          <div><span style={label}>Location</span><input name="location" placeholder="van / shop bin" style={input} autoComplete="off" /></div>
          <div><span style={label}>System qty</span><input name="system_qty" type="number" step="0.01" value={sysQ} onChange={(e) => setSysQ(e.target.value)} placeholder="0" style={input} /></div>
          <div><span style={label}>Counted *</span><input name="counted_qty" type="number" step="0.01" placeholder="0" style={input} required /></div>
        </div>
        <input name="note" placeholder="Note (optional)" style={input} autoComplete="off" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" className="btn" disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>{pending ? 'Saving…' : 'Record count'}</button>
          {msg && <span style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
        </div>
      </form>

      {!counts.length && <div className="card"><span className="muted">No counts yet — record one above.</span></div>}
      <div style={{ display: 'grid', gap: 6 }}>
        {counts.map((c) => {
          const b = vBadge(c.variance);
          return (
            <div key={c.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', flexWrap: 'wrap', borderLeft: `3px solid ${b.c}` }}>
              <span style={{ flex: '1 1 140px', fontWeight: 700, fontSize: 13.5 }}>{c.item}{c.location ? <span className="muted" style={{ fontSize: 11 }}> · {c.location}</span> : ''}</span>
              <span className="muted" style={{ fontSize: 12 }}>sys {c.system_qty} → counted {c.counted_qty}</span>
              <span style={{ fontWeight: 800, fontSize: 13, color: b.c }}>{b.t}</span>
              <span className="muted" style={{ fontSize: 11 }}>{dt(c.created_at)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

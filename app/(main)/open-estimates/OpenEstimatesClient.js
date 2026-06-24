'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { logContact, setOutcome } from './actions';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const ageH = (iso) => { try { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)); } catch { return 0; } };
const ageLabel = (h) => (h < 48 ? h + 'h' : Math.floor(h / 24) + 'd');

export default function OpenEstimatesClient({ rows }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [filter, setFilter] = useState('open');

  const run = (fn) => { setMsg(null); start(async () => { const r = await fn(); setMsg(r); if (r?.ok) router.refresh(); }); };

  const counts = useMemo(() => {
    const c = { all: rows.length, open: 0, won: 0, lost: 0, openValue: 0 };
    rows.forEach((r) => { const k = r.outcome || 'open'; c[k] = (c[k] || 0) + 1; if (!r.outcome) c.openValue += r.amount; });
    return c;
  }, [rows]);
  const shown = rows.filter((r) => (filter === 'all' ? true : (r.outcome || 'open') === filter));

  return (
    <>
      <div className="card" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', borderTop: '2px solid var(--accent)' }}>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Open value</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{money(counts.openValue)}</div></div>
        {['open', 'won', 'lost', 'all'].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="pill" style={{ cursor: 'pointer', textTransform: 'capitalize', fontWeight: filter === f ? 800 : 600, border: filter === f ? '1px solid var(--amber)' : '1px solid transparent', background: filter === f ? 'color-mix(in oklab, var(--amber) 16%, var(--surface-2))' : 'var(--surface-2)' }}>{f} <strong>{counts[f] || 0}</strong></button>
        ))}
      </div>
      {msg && <div className="muted" style={{ fontSize: 12, margin: '8px 0', color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}

      {!shown.length && <div className="card" style={{ marginTop: 10 }}><span className="muted">{rows.length ? 'Nothing in this filter.' : 'No estimates yet — they appear here when a customer accepts a tier on the Estimate builder.'}</span></div>}

      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {shown.map((r) => {
          const h = ageH(r.createdAt);
          const stale = !r.outcome && h >= 24;
          return (
            <div key={r.id} className="card" style={{ borderLeft: `3px solid ${r.outcome === 'won' ? 'var(--green)' : r.outcome === 'lost' ? 'var(--fg-3)' : stale ? 'var(--red)' : 'var(--amber)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.customer} <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>{money(r.amount)}</span>{r.tier ? <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}> · {r.tier}</span> : null}</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {r.id} · {ageLabel(h)} old{r.by ? ` · by ${r.by}` : ''}{r.contactCount ? ` · ${r.contactCount} contact${r.contactCount > 1 ? 's' : ''}` : ' · not contacted'}
                    {stale ? <span style={{ color: 'var(--red)', fontWeight: 700 }}> · overdue follow-up</span> : null}
                  </div>
                </div>
                {r.outcome && <span className="pill" style={{ fontSize: 10.5, color: r.outcome === 'won' ? 'var(--green)' : 'var(--fg-3)', textTransform: 'capitalize', alignSelf: 'flex-start' }}>{r.outcome}</span>}
              </div>
              {!r.outcome && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  <button disabled={pending} onClick={() => run(() => logContact(r.id))} className="pill" style={{ cursor: 'pointer' }}>Log contact</button>
                  <button disabled={pending} onClick={() => run(() => setOutcome(r.id, 'won'))} className="pill" style={{ cursor: 'pointer', background: 'rgba(70,193,120,.16)', color: 'var(--green)', fontWeight: 800 }}>Won</button>
                  <button disabled={pending} onClick={() => run(() => setOutcome(r.id, 'lost'))} className="pill" style={{ cursor: 'pointer', color: 'var(--fg-3)' }}>Lost</button>
                  {r.jobId && <Link href={`/job/${r.jobId}`} className="pill">Open job</Link>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

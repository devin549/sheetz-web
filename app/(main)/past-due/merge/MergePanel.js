'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { searchCustomers, mergeCustomers } from '../actions';

const ctrl = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 13 };

// One search box → resolves to a chosen customer.
function Picker({ label, picked, onPick }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, start] = useTransition();
  const run = (v) => { setQ(v); start(async () => { const r = await searchCustomers(v); setResults(r.ok ? r.results : []); }); };
  return (
    <div style={{ flex: 1, minWidth: 240 }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>{label}</div>
      {picked
        ? <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, ...ctrl }}>
            <span style={{ fontWeight: 700 }}>{picked.name}{picked.cb_number ? <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>CB-{picked.cb_number}</span> : ''}</span>
            <button onClick={() => onPick(null)} style={{ background: 'none', border: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: 12 }}>change</button>
          </div>
        : <>
            <input value={q} onChange={(e) => run(e.target.value)} placeholder="🔎 search by name…" style={ctrl} />
            {!!results.length && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 180, overflowY: 'auto', background: 'var(--surface-1)' }}>
                {results.map((r) => (
                  <div key={r.id} onClick={() => { onPick(r); setResults([]); setQ(''); }} style={{ padding: '7px 10px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12.5 }}>
                    {r.name}{r.cb_number ? <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>CB-{r.cb_number}</span> : ''}
                  </div>
                ))}
              </div>
            )}
            {busy && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>searching…</div>}
          </>}
    </div>
  );
}

export default function MergePanel() {
  const router = useRouter();
  const [keep, setKeep] = useState(null);
  const [dupe, setDupe] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, start] = useTransition();

  const doMerge = () => {
    if (!keep || !dupe) return;
    if (!window.confirm(`Merge "${dupe.name}" INTO "${keep.name}"? Everything moves to ${keep.name} and ${dupe.name} is removed. This can’t be undone.`)) return;
    setErr(null);
    start(async () => { const r = await mergeCustomers(keep.id, dupe.id); if (r.ok) { setResult(r); setKeep(null); setDupe(null); router.refresh(); } else setErr(r.msg); });
  };

  return (
    <div className="card card-amber">
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Picker label="✅ Keep this one" picked={keep} onPick={setKeep} />
        <div style={{ alignSelf: 'center', fontSize: 20, color: 'var(--fg-3)', paddingTop: 18 }}>⬅</div>
        <Picker label="🗑️ Merge & remove this duplicate" picked={dupe} onPick={setDupe} />
      </div>

      {err && <div className="notice" style={{ marginTop: 10, color: 'var(--red)', borderColor: 'var(--red)' }}>{err}</div>}
      {result && (
        <div className="notice" style={{ marginTop: 10, color: 'var(--green)', borderColor: 'var(--green)' }}>
          ✅ Merged <strong>{result.dupe}</strong> into <strong>{result.keep}</strong>. Moved: {Object.entries(result.moved).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(' · ') || 'records'}. <Link href="/past-due">See A/R →</Link>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={doMerge} disabled={busy || !keep || !dupe} className="btn" style={{ opacity: (busy || !keep || !dupe) ? 0.55 : 1 }}>
          {busy ? 'Merging…' : '🔁 Merge'}
        </button>
      </div>
    </div>
  );
}

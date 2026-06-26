'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { searchLeads, saveLeads, setLeadStatus } from './actions';

const sel = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 };
const STAGES = [['new', 'New', 'var(--amber)'], ['contacted', 'Contacted', 'var(--blue)'], ['qualified', 'Qualified', 'var(--green)'], ['won', 'Won 🎉', 'var(--green)'], ['dead', 'Dead', 'var(--fg-3)']];
const dial = (p) => String(p || '').replace(/[^0-9+]/g, '');

export default function LeadsClient({ categories = [], towns = [], saved = [], disabled }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cat, setCat] = useState(categories[0] || '');
  const [town, setTown] = useState(towns[0] || '');
  const [results, setResults] = useState(null);
  const [picked, setPicked] = useState({});
  const [msg, setMsg] = useState(null);

  const run = () => start(async () => { setMsg('🔎 Searching Maps…'); setResults(null); const r = await searchLeads(cat, town); if (r.ok) { setResults(r.results); setPicked({}); setMsg(`${r.results.length} found`); } else setMsg(r.msg); });
  const toggle = (i) => setPicked((p) => ({ ...p, [i]: !p[i] }));
  const save = (which) => start(async () => { const rows = (which || results.filter((_, i) => picked[i])).filter((r) => !r.saved); if (!rows.length) { setMsg('Nothing new to save.'); return; } const r = await saveLeads(rows); setMsg(r.msg); if (r.ok) { setResults((rs) => rs.map((x) => rows.includes(x) ? { ...x, saved: true } : x)); router.refresh(); } });
  const mark = (id, status) => start(async () => { const r = await setLeadStatus(id, status); setMsg(r.msg); router.refresh(); });

  const byStage = {}; STAGES.forEach(([k]) => { byStage[k] = saved.filter((l) => l.status === k); });

  return (
    <div style={{ marginTop: 12 }}>
      {/* Search */}
      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ ...sel, flex: '1 1 200px' }}>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <span className="muted">in</span>
        <select value={town} onChange={(e) => setTown(e.target.value)} style={{ ...sel, flex: '1 1 160px' }}>{towns.map((t) => <option key={t} value={t}>{t.split(',')[0]}</option>)}</select>
        <button onClick={run} disabled={pending || disabled} className="btn">🔎 Find leads</button>
      </div>
      {msg && <div style={{ fontSize: 12.5, margin: '8px 2px', color: 'var(--fg-2)' }}>{msg}</div>}

      {/* Results */}
      {results && results.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={() => save()} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>💾 Save selected</button>
            <button onClick={() => save(results)} disabled={pending} className="pill" style={{ cursor: 'pointer' }}>Save all new</button>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {results.map((r, i) => (
              <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', opacity: r.saved ? 0.6 : 1 }}>
                {!r.saved && <input type="checkbox" checked={!!picked[i]} onChange={() => toggle(i)} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.name} {r.rating ? <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>★{r.rating} ({r.reviews || 0})</span> : null}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{r.address}</div>
                </div>
                {r.phone && <a href={`tel:${dial(r.phone)}`} className="pill" style={{ color: 'var(--green)' }}>📞 {r.phone}</a>}
                {r.saved && <span className="pill" style={{ fontSize: 10, color: 'var(--fg-3)' }}>in pipeline</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {results && results.length === 0 && <div className="card" style={{ marginTop: 6 }}><span className="muted">No results — try a different type or town.</span></div>}

      {/* Pipeline */}
      {saved.length > 0 && (
        <>
          <div className="h2" style={{ marginTop: 20 }}>Pipeline <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· {saved.length}</span></div>
          {STAGES.map(([k, label, color]) => byStage[k].length > 0 && (
            <div key={k} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 12.5, color, marginBottom: 5 }}>{label} · {byStage[k].length}</div>
              <div style={{ display: 'grid', gap: 5 }}>
                {byStage[k].map((l) => (
                  <div key={l.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{l.name}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{l.category}{l.address ? ` · ${l.address}` : ''}{l.claimed_by ? ` · ${l.claimed_by}` : ''}</div>
                    </div>
                    {l.phone && <a href={`tel:${dial(l.phone)}`} className="pill" style={{ color: 'var(--green)' }}>📞</a>}
                    <select value={l.status} onChange={(e) => mark(l.id, e.target.value)} disabled={pending} style={{ ...sel, padding: '5px 7px', fontSize: 11.5 }}>
                      {STAGES.map(([s, sl]) => <option key={s} value={s}>{sl}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

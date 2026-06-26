'use client';

import { useState, useTransition } from 'react';
import { identifyPart, learnPartFix } from './actions';
import { recordSale } from '../job/[id]/pricebook/actions';
import InAppCamera from '../job/[id]/InAppCamera';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const HEALTH = { healthy: ['Healthy', 'var(--green)'], thin: ['Thin', 'var(--amber)'], danger: ['Danger', 'var(--red)'] };

export default function IdentifyClient({ activeJobId, activeJobNumber, showCost }) {
  const [pending, start] = useTransition();
  const [cam, setCam] = useState(false);
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState(null);
  const [added, setAdded] = useState({});
  const [learned, setLearned] = useState({});

  const onPhoto = (file) => { setCam(false); setRes(null); setMsg('🔎 Identifying…'); start(async () => { const r = await identifyPart(toFD(file)); if (r.ok) { setRes(r); setMsg(null); } else setMsg(r.msg); }); };
  const toFD = (file) => { const fd = new FormData(); fd.set('photo', file); return fd; };
  // Adding the fix to the job also teaches the library (confirming it's the right part).
  const addToJob = (fix) => start(async () => { const r = await recordSale(activeJobId, [{ itemId: fix.id, quantity: 1, soldPrice: fix.price }]); setMsg(r.msg); if (r.ok) { setAdded((a) => ({ ...a, [fix.id]: true })); learnPartFix(res.guess, fix.id).catch(() => {}); setLearned((l) => ({ ...l, [fix.id]: true })); } });
  const teach = (fix) => start(async () => { const r = await learnPartFix(res.guess, fix.id); setMsg(r.msg); if (r.ok) setLearned((l) => ({ ...l, [fix.id]: true })); });

  return (
    <div style={{ marginTop: 12 }}>
      <button onClick={() => setCam(true)} disabled={pending} className="btn" style={{ width: '100%', padding: 16, fontSize: 16 }}>📸 Snap the part</button>
      {msg && <div style={{ fontSize: 13, marginTop: 10, color: msg.startsWith('🔎') ? 'var(--fg-2)' : 'var(--amber)' }}>{msg}</div>}

      {res && (
        <div style={{ marginTop: 14 }}>
          {res.photoUrl && <img src={res.photoUrl} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 12, float: 'right', marginLeft: 12, background: 'var(--surface-2)' }} />}
          <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Looks like</div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{res.guess || 'Couldn’t pin it down'}</div>

          {/* The fix from the pricebook — the money shot */}
          {res.fixes && res.fixes.length > 0 ? (
            <div style={{ clear: 'both', marginTop: 14 }}>
              <div className="h2" style={{ fontSize: 14 }}>🔧 The fix · from your pricebook</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {res.fixes.map((f) => (
                  <div key={f.id} className="card card-amber" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{f.name}</div>
                      {showCost && f.marginHealth && <span className="pill" style={{ fontSize: 9.5, color: (HEALTH[f.marginHealth] || [])[1] }}>{(HEALTH[f.marginHealth] || [])[0]}{f.marginPct != null ? ` · ${f.marginPct}%` : ''}</span>}
                    </div>
                    <div style={{ fontWeight: 800, color: 'var(--green)', fontSize: 16 }}>{money(f.price)}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                      {activeJobId && (added[f.id]
                        ? <span className="pill" style={{ fontSize: 10, color: 'var(--green)' }}>✓ added</span>
                        : <button onClick={() => addToJob(f)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>➕ Job #{activeJobNumber || ''}</button>)}
                      {learned[f.id]
                        ? <span className="pill" style={{ fontSize: 9, color: 'var(--purple, #a78bfa)' }}>🧠 learned</span>
                        : <button onClick={() => teach(f)} disabled={pending} className="pill" style={{ cursor: 'pointer', fontSize: 9.5, color: 'var(--fg-3)' }}>✓ that’s it</button>}
                    </div>
                  </div>
                ))}
              </div>
              {!activeJobId && <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Open this from an active job to add the fix to the estimate.</div>}
            </div>
          ) : (
            <div className="card" style={{ clear: 'both', marginTop: 14 }}><span className="muted">No direct pricebook match — check the catalog, or it may be a part to order (see matches below).</span></div>
          )}

          {/* Raw Lens matches — what it is / where to buy */}
          {res.matches && res.matches.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="h2" style={{ fontSize: 14 }}>What it is · where to get it</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {res.matches.slice(0, 6).map((m, i) => (
                  <a key={i} href={m.link || '#'} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
                    {m.thumbnail && <img src={m.thumbnail} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, background: '#fff' }} />}
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div><div className="muted" style={{ fontSize: 10.5 }}>{m.source}</div></div>
                    {m.price && <div style={{ fontWeight: 700, color: 'var(--fg-2)', fontSize: 12.5 }}>{money(m.price)}</div>}
                  </a>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => setCam(true)} disabled={pending} className="pill" style={{ cursor: 'pointer', marginTop: 14 }}>📸 Try another</button>
        </div>
      )}

      {cam && <InAppCamera label="Identify a part" onCapture={onPhoto} onClose={() => setCam(false)} />}
    </div>
  );
}

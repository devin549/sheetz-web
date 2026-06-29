'use client';

// 🔎 Describe the problem → find the fix. The tech types the SYMPTOM (or the scan's "reason") — "toilet
// leaking around base", "disposal humming" — and AI maps it to OUR pricebook fixes to add. Solves the parts
// the photo scan can't (disposals) and symptom search ("leaking around base" → wax ring). Suggest-only.
import { useState, useTransition } from 'react';
import { findFixesByProblem } from './customEntryActions';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function ProblemFinder({ jobType = '', onAdd }) {
  const [pending, start] = useTransition();
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState(null);
  const [added, setAdded] = useState({});

  const find = () => start(async () => {
    setMsg(null); setRes(null);
    const r = await findFixesByProblem(text, jobType);
    if (r.ok) setRes(r); else setMsg(r.msg);
  });
  const pick = (f) => { if (onAdd) onAdd({ id: f.id, name: f.name, price: f.price, minimum: null }); setAdded((a) => ({ ...a, [f.id]: true })); };

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={text} onChange={(e) => { setText(e.target.value); setRes(null); }} onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) find(); }}
          placeholder="Describe the problem — e.g. toilet leaking around base"
          style={{ flex: 1, minWidth: 0, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 12px', fontSize: 13.5 }} />
        <button onClick={find} disabled={pending || !text.trim()} className="btn" style={{ background: 'var(--surface-2)', color: 'var(--fg-1)', border: '1px solid var(--border-strong)', whiteSpace: 'nowrap', opacity: (pending || !text.trim()) ? 0.6 : 1 }}>{pending ? '✨…' : '✨ Find the fix'}</button>
      </div>
      {msg && <div style={{ fontSize: 12, marginTop: 6, color: 'var(--amber)' }}>{msg}</div>}
      {res && (
        <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          {res.cause && <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>💡 Likely: {res.cause}</div>}
          {res.fixes && res.fixes.length > 0 ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div className="muted" style={{ fontSize: 11 }}>Fixes from your book — tap to add:</div>
              {res.fixes.map((f) => (
                <button key={f.id} onClick={() => pick(f)} disabled={added[f.id]} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: added[f.id] ? 'color-mix(in oklab, var(--green) 12%, var(--surface-1))' : 'var(--surface-2)', border: '1px solid var(--border)', cursor: added[f.id] ? 'default' : 'pointer', textAlign: 'left' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ fontWeight: 700, color: 'var(--amber)' }}>{money(f.price)}</span>
                  <span className="pill" style={{ fontSize: 10, color: added[f.id] ? 'var(--green)' : 'var(--amber)' }}>{added[f.id] ? '✓ added' : '➕ add'}</span>
                </button>
              ))}
            </div>
          ) : <div className="muted" style={{ fontSize: 12 }}>No match in your book — browse the categories or add a custom line.</div>}
        </div>
      )}
    </div>
  );
}

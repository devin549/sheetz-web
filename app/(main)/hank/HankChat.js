'use client';

import { useRef, useState, useTransition } from 'react';
import { askHank } from './actions';

const QUICK = [
  'Gas water heater — no hot water, pilot won’t stay lit',
  'Electric water heater tripping the breaker',
  'KY sewer permit — what depth/length needs one?',
  'Kitchen drain backs up, clears then returns',
  'Size a water heater for a 4-bath house',
  'Toilet keeps running after flush',
];

export default function HankChat() {
  const [turns, setTurns] = useState([]); // {q, a}
  const [q, setQ] = useState('');
  const [err, setErr] = useState(null);
  const [busy, start] = useTransition();
  const boxRef = useRef(null);

  const ask = (question) => {
    const text = String(question || q).trim();
    if (!text || busy) return;
    setErr(null); setQ('');
    start(async () => {
      const r = await askHank(text, turns);
      if (r.ok) { setTurns((t) => [...t, { q: text, a: r.answer }]); setTimeout(() => boxRef.current?.scrollTo(0, boxRef.current.scrollHeight), 50); }
      else setErr(r.msg);
    });
  };

  return (
    <>
      {/* quick questions */}
      {!turns.length && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 12px' }}>
          {QUICK.map((s) => (
            <button key={s} onClick={() => ask(s)} disabled={busy} className="pill" style={{ cursor: 'pointer', fontSize: 12, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--fg-2)' }}>{s}</button>
          ))}
        </div>
      )}

      {/* conversation */}
      <div ref={boxRef} style={{ maxHeight: '58vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
        {turns.map((t, i) => (
          <div key={i}>
            <div style={{ alignSelf: 'flex-end', background: 'var(--accent)', color: '#1a1206', fontWeight: 700, padding: '9px 12px', borderRadius: '12px 12px 2px 12px', marginLeft: 'auto', maxWidth: '85%', width: 'fit-content', fontSize: 14 }}>{t.q}</div>
            <div className="card card-amber" style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55 }}>
              <div style={{ fontWeight: 800, color: 'var(--accent)', fontSize: 12, marginBottom: 4 }}>🪠 Hank</div>
              {t.a}
            </div>
          </div>
        ))}
        {busy && <div className="muted" style={{ fontSize: 13 }}>🪠 Hank is thinking…</div>}
      </div>

      {err && <div className="notice" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>{err}</div>}

      {/* ask box */}
      <div style={{ display: 'flex', gap: 8, position: 'sticky', bottom: 0, background: 'var(--bg)', paddingTop: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
          placeholder="Ask Hank — water heaters, drains, code, specs…"
          style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 10, padding: '12px 14px', fontSize: 15 }} />
        <button onClick={() => ask()} disabled={busy || !q.trim()} className="btn" style={{ opacity: (busy || !q.trim()) ? 0.55 : 1, padding: '12px 18px' }}>{busy ? '…' : 'Ask'}</button>
      </div>
    </>
  );
}

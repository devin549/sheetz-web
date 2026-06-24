'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { askBoard } from './actions';

const SAMPLES = [
  "What's my AR outstanding?", 'Who owes us the most?', 'Which invoice is oldest?',
  'How many urgent jobs right now?', "What's booked today?", 'How many customers do we have?',
];

export default function AskBoardFull() {
  const [q, setQ] = useState('');
  const [thread, setThread] = useState([]); // {q, a, err}
  const [pending, start] = useTransition();
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [thread, pending]);

  function ask(question) {
    const text = (question ?? q).trim();
    if (!text || pending) return;
    setQ('');
    setThread((t) => [...t, { q: text, a: null, err: null }]);
    start(async () => {
      const r = await askBoard(text);
      setThread((t) => t.map((m, i) => (i === t.length - 1 ? { ...m, a: r?.ok ? r.answer : null, err: r?.ok ? null : (r?.msg || 'Failed.') } : m)));
    });
  }

  return (
    <div className="card card-amber" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {SAMPLES.map((s) => <button key={s} onClick={() => ask(s)} disabled={pending} className="pill" style={{ cursor: 'pointer', fontSize: 11, color: 'var(--fg-2)' }}>{s}</button>)}
      </div>

      {thread.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '52vh', overflowY: 'auto', paddingRight: 4 }}>
          {thread.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: 'var(--surface-3)', borderRadius: '12px 12px 2px 12px', padding: '8px 12px', fontSize: 13.5, fontWeight: 600 }}>{m.q}</div>
              {m.a != null ? (
                <div style={{ alignSelf: 'flex-start', maxWidth: '92%', background: 'var(--surface-2)', borderLeft: '3px solid var(--accent)', borderRadius: '2px 12px 12px 12px', padding: '10px 12px', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.a}</div>
              ) : m.err ? (
                <div style={{ alignSelf: 'flex-start', fontSize: 12.5, color: 'var(--red)' }}>{m.err}</div>
              ) : (
                <div style={{ alignSelf: 'flex-start', fontSize: 13, color: 'var(--fg-3)' }}>Hank is checking the numbers…</div>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); ask(); }} style={{ display: 'flex', gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about jobs, money, customers…"
          style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '11px 12px', fontSize: 14 }} autoFocus />
        <button type="submit" className="btn" disabled={pending}>{pending ? '…' : 'Ask'}</button>
      </form>
      <div className="muted" style={{ fontSize: 10.5 }}>Answers are generated from a live snapshot of your data. Double-check anything you act on.</div>
    </div>
  );
}

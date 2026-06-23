'use client';

import { useState, useTransition } from 'react';
import { askBoard } from './actions';

const SAMPLES = ["What's my AR outstanding?", 'How many urgent jobs right now?', "What's booked today?", 'How many customers owe us?'];

export default function AskBoard() {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  const [err, setErr] = useState(null);
  const [pending, start] = useTransition();

  function ask(question) {
    const text = (question ?? q).trim();
    if (!text) return;
    setQ(text); setErr(null); setAnswer(null);
    start(async () => { const r = await askBoard(text); if (r?.ok) setAnswer(r.answer); else setErr(r?.msg || 'Failed.'); });
  }

  return (
    <div className="card card-amber">
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>🦫 Ask the Board <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>· Hank answers from your live numbers</span></div>
      <form onSubmit={(e) => { e.preventDefault(); ask(); }} style={{ display: 'flex', gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about jobs, money, customers…"
          style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 }} />
        <button type="submit" className="btn" disabled={pending}>{pending ? '…' : 'Ask'}</button>
      </form>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {SAMPLES.map((s) => <button key={s} onClick={() => ask(s)} disabled={pending} className="pill" style={{ cursor: 'pointer', fontSize: 11, color: 'var(--fg-2)' }}>{s}</button>)}
      </div>
      {answer && <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--surface-2)', borderLeft: '3px solid var(--accent)', borderRadius: 6, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{answer}</div>}
      {err && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--red)' }}>{err}</div>}
    </div>
  );
}

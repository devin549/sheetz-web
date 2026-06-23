'use client';

import { useState, useTransition } from 'react';
import { askAccounting } from './actions';

function money(n) { return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function ago(iso) {
  try { const m = (Date.now() - new Date(iso).getTime()) / 60000; if (m < 1) return 'just now'; if (m < 60) return Math.floor(m) + 'm ago'; const h = m / 60; if (h < 24) return Math.floor(h) + 'h ago'; return Math.floor(h / 24) + 'd ago'; } catch { return ''; }
}
const SAMPLES = ['Who should I chase today?', "Who's 90+ days?", 'Summarize my AR', 'What got collected recently?'];

export default function AccountingBot({ recent }) {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  const [err, setErr] = useState(null);
  const [pending, start] = useTransition();

  function ask(question) {
    const text = (question ?? q).trim();
    if (!text) return;
    setQ(text); setErr(null); setAnswer(null);
    start(async () => { const r = await askAccounting(text); if (r?.ok) setAnswer(r.answer); else setErr(r?.msg || 'Failed.'); });
  }

  return (
    <div className="card card-amber" style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>📒 Books Bot <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>· watches your AR + keeps the collections ledger</span></div>

      <form onSubmit={(e) => { e.preventDefault(); ask(); }} style={{ display: 'flex', gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask the books bot about your receivables…"
          style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 }} />
        <button type="submit" className="btn" disabled={pending}>{pending ? '…' : 'Ask'}</button>
      </form>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {SAMPLES.map((s) => <button key={s} onClick={() => ask(s)} disabled={pending} className="pill" style={{ cursor: 'pointer', fontSize: 11, color: 'var(--fg-2)' }}>{s}</button>)}
      </div>
      {answer && <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--surface-2)', borderLeft: '3px solid var(--accent)', borderRadius: 6, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{answer}</div>}
      {err && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--red)' }}>{err}</div>}

      {/* the ledger the bot keeps */}
      <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>🧾 Collections ledger</div>
        {(!recent || !recent.length) && <div className="muted" style={{ fontSize: 12 }}>No activity yet — mark an invoice paid and it logs here.</div>}
        {(recent || []).map((a) => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', fontSize: 12 }}>
            <span>✓ <strong>{money(a.amount)}</strong> {a.action === 'customer_paid' ? 'cleared for' : 'paid ·'} {a.customer_name || 'customer'}{a.invoice_number ? ` (#${a.invoice_number})` : ''}</span>
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>{a.by_email ? a.by_email.split('@')[0] + ' · ' : ''}{ago(a.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

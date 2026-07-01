'use client';

// 💬 The job's two-way thread — one timeline for everything that happened on this job: tech notes, the
// office's replies, and the step-away pings (parts run / lunch / personal / need-a-hand). Persistent, so
// nothing gets lost in Discord. The office opens the job and replies here; the tech sees it on refresh.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { messageOffice } from './actions';

const KIND = {
  message:      { icon: '💬', label: null,             side: 'tech' },
  office_reply: { icon: '🏢', label: 'Office',         side: 'office' },
  parts_run:    { icon: '🛒', label: 'Parts run',      side: 'tech' },
  lunch:        { icon: '🍔', label: 'Lunch',          side: 'tech' },
  personal:     { icon: '🚶', label: 'Personal',       side: 'tech' },
  help:         { icon: '🆘', label: 'Need a hand',    side: 'tech' },
  back:         { icon: '🔧', label: 'Back on site',   side: 'tech' },
  system:       { icon: '⚙️', label: 'System',         side: 'system' },
};
const when = (iso) => { try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

export default function JobThread({ jobId, messages = [], canReply = false }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const send = () => { setMsg(null); start(async () => { const r = await messageOffice(jobId, text); setMsg(r); if (r?.ok) { setText(''); router.refresh(); } }); };

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        💬 Job thread <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>· office ↔ tech · internal, never the customer</span>
      </div>

      {messages.length === 0 ? (
        <div className="muted" style={{ fontSize: 12, padding: '4px 0 8px' }}>No messages yet. A note here reaches the office — parts runs, lunch, and “need a hand” land here too.</div>
      ) : (
        <div style={{ display: 'grid', gap: 7, marginBottom: 10 }}>
          {messages.map((m) => {
            const k = KIND[m.kind] || KIND.message;
            const office = k.side === 'office';
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: office ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '85%', padding: '7px 10px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.4,
                  background: office ? 'color-mix(in oklab, var(--blue, #4a9eff) 14%, var(--surface-2))' : 'var(--surface-2)',
                  border: `1px solid ${office ? 'var(--blue, #4a9eff)' : 'var(--border)'}` }}>
                  <div style={{ fontSize: 10.5, color: 'var(--fg-3)', marginBottom: 2 }}>
                    <span>{k.icon} </span>{k.label ? <strong style={{ color: office ? 'var(--blue, #4a9eff)' : 'var(--amber)' }}>{k.label}</strong> : null}
                    <span> {m.author_name || 'Someone'} · {when(m.created_at)}</span>
                  </div>
                  {m.body ? <div>{m.body}</div> : (k.label ? null : <span className="muted">—</span>)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
          placeholder={canReply ? 'Reply to the tech…' : 'Message the office — a question, a heads-up, need a correction visit…'}
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 13, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={send} disabled={pending || text.trim().length < 2} className="btn" style={{ opacity: (pending || text.trim().length < 2) ? 0.6 : 1 }}>{pending ? 'Sending…' : canReply ? 'Reply' : 'Send'}</button>
          {msg && <span style={{ fontSize: 12, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
        </div>
      </div>
    </div>
  );
}

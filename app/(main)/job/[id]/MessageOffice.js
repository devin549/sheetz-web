'use client';

// Cockpit "Message office" — tech pings the office/supervisor from the job (e.g. a photo failed and
// they need help). Internal only, logged to audit_log. Not a customer message.
import { useState, useTransition } from 'react';
import { messageOffice } from './actions';
import { MessageSquare } from 'lucide-react';

export default function MessageOffice({ jobId }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();
  const send = () => { setMsg(null); start(async () => { const r = await messageOffice(jobId, text); setMsg(r); if (r?.ok) { setText(''); setOpen(false); } }); };

  if (!open) {
    return (
      <button onClick={() => { setOpen(true); setMsg(null); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--fg-2)', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
        <MessageSquare size={14} /> Message office
        {msg?.ok && <span style={{ color: 'var(--green)' }}>✓ sent</span>}
      </button>
    );
  }
  return (
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontWeight: 800, fontSize: 13 }}>Message the office</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="e.g. After photo failed — customer left, need a correction visit." style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 13, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={send} disabled={pending || text.trim().length < 2} className="btn" style={{ opacity: pending || text.trim().length < 2 ? 0.6 : 1 }}>{pending ? 'Sending…' : 'Send'}</button>
        <button onClick={() => setOpen(false)} className="pill" style={{ cursor: 'pointer' }}>Cancel</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </div>
  );
}

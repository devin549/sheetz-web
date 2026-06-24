'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { postTeamMessage } from './actions';
import { Send, Phone, Mail, MessageSquare } from 'lucide-react';

const dt = (s) => { try { return new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const CHAN = {
  discord: { icon: <MessageSquare size={13} />, label: '#sheetz', color: 'var(--accent)' },
  sms: { icon: <Phone size={13} />, label: 'SMS', color: 'var(--green)' },
  email: { icon: <Mail size={13} />, label: 'Email', color: 'var(--amber)' },
};

export default function MessagesClient({ comms, discordReady, commsMissing }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);

  function post(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const fd = new FormData(); fd.set('text', text);
    setMsg(null);
    start(async () => { const r = await postTeamMessage(fd); setMsg(r); if (r.ok) { setText(''); router.refresh(); } });
  }

  return (
    <>
      {!discordReady && <div className="notice" style={{ fontSize: 12, marginBottom: 12 }}>Add <code>DISCORD_WEBHOOK_URL</code> (your #sheetz Captain Hook webhook) in Vercel to actually post. Messages still log below.</div>}

      <form onSubmit={post} className="card card-amber" style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.05em' }}>📣 Post to #sheetz</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Team alert to the #sheetz channel…" style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" className="btn" disabled={pending || !text.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: (pending || !text.trim()) ? 0.6 : 1 }}><Send size={15} /> {pending ? 'Posting…' : 'Post'}</button>
          {msg && <span style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
        </div>
      </form>

      <h3 style={{ fontSize: 12, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 8px' }}>Recent messages</h3>
      {commsMissing && <div className="notice" style={{ fontSize: 12 }}>Comms log needs its table — run <code>supabase/41_comms.sql</code>.</div>}
      {!commsMissing && !comms.length && <div className="card"><span className="muted">Nothing yet — booking alerts, texts, and emails will show here.</span></div>}
      <div style={{ display: 'grid', gap: 6 }}>
        {comms.map((m) => {
          const ch = CHAN[m.channel] || { icon: null, label: m.channel, color: 'var(--fg-3)' };
          return (
            <div key={m.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', flexWrap: 'wrap', opacity: m.status === 'failed' ? 0.6 : 1 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: ch.color, minWidth: 64 }}>{ch.icon} {ch.label}</span>
              <span style={{ flex: '1 1 200px', fontSize: 13, minWidth: 0 }}>{m.body}</span>
              <span className="muted" style={{ fontSize: 11 }}>{m.to_addr || ''}</span>
              {m.status === 'failed' && <span className="pill pill-red" style={{ fontSize: 10 }}>failed</span>}
              <span className="muted" style={{ fontSize: 11 }}>{m.sent_by || ''} · {dt(m.created_at)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

'use client';

// Tech-side Team Chat (HTML chat pane) — simple: the #sheetz team feed + a post box. Not the office
// Comms Desk (delete / proposed-actions / customer threads). Read the team, drop a line, see Hank's chime.
import { useRef, useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { postChat, ackChat, markChatRead } from './actions';

const fmt = (iso) => { try { return new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const initials = (n) => String(n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function TechChat({ messages = [], me = '' }) {
  const router = useRouter();
  const formRef = useRef(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  // Opening the chat marks it read → clears the sidebar Chat badge/blink (refresh so the rail updates).
  useEffect(() => { markChatRead().then(() => router.refresh()).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Auto-sync: re-pull the feed every 20s so new #sheetz chatter shows up without a manual refresh.
  useEffect(() => { const id = setInterval(() => router.refresh(), 20000); return () => clearInterval(id); }, [router]);
  // Blink: messages that weren't on screen at mount/last-render get a one-time highlight.
  const seen = useRef(new Set(messages.map((m) => m.id)));
  const isNew = (id) => !seen.current.has(id);
  useEffect(() => { messages.forEach((m) => seen.current.add(m.id)); });

  const send = (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); setMsg(null); start(async () => { const r = await postChat(fd); setMsg(r); if (r.ok) { formRef.current?.reset(); router.refresh(); } }); };

  return (
    <div className="wrap" style={{ maxWidth: 560 }}>
      <div className="h1" style={{ fontSize: 20 }}>👥 Team Chat</div>
      <p className="muted" style={{ fontSize: 12.5 }}>The whole crew + office in #sheetz. Quick question, status, or a heads-up — everyone sees it. 🪠 Hank chimes in when he can help.</p>

      {/* post box */}
      <form ref={formRef} onSubmit={send} className="card card-amber" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea name="text" rows={2} required placeholder="Message the team…" style={{ flex: 1, resize: 'vertical', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 }} />
        <button className="btn" type="submit" disabled={pending}>{pending ? '…' : 'Send'}</button>
      </form>
      {msg && <div style={{ fontSize: 12, margin: '6px 0', color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}

      {/* feed */}
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {messages.length === 0 && <div className="card"><span className="muted">No team messages yet. Say hi 👋</span></div>}
        {messages.map((m) => {
          const mine = String(m.from_name || '').trim().toLowerCase() === String(me).trim().toLowerCase();
          const isHank = /hank/i.test(m.from_name || '');
          const fresh = isNew(m.id) && !mine;
          // Blink color by importance: red = personal (address this), blue = office, amber = general.
          const blinkClass = !fresh ? '' : m.tag === 'personal' ? 'cb-blink-red' : m.tag === 'office' ? 'cb-blink-blue' : 'cb-blink';
          const tagBadge = !fresh ? null : m.tag === 'personal'
            ? <span style={{ color: 'var(--red)', fontSize: 9, fontWeight: 800 }}> · 📌 FOR YOU</span>
            : m.tag === 'office' ? <span style={{ color: 'var(--blue)', fontSize: 9, fontWeight: 800 }}> · 🏢 OFFICE</span>
            : <span style={{ color: 'var(--amber)', fontSize: 9, fontWeight: 800 }}> · NEW</span>;
          const bubbleBorder = m.tag === 'personal' && fresh ? 'var(--red)' : m.tag === 'office' && fresh ? 'var(--blue)' : isHank ? 'var(--purple, #9c64f4)' : 'var(--border)';
          return (
            <div key={m.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', flexDirection: mine ? 'row-reverse' : 'row' }}>
              <div style={{ width: 30, height: 30, borderRadius: 999, flexShrink: 0, background: isHank ? 'var(--purple, #9c64f4)' : mine ? 'var(--amber)' : 'var(--surface-3)', color: isHank ? '#fff' : mine ? '#1a1206' : 'var(--fg-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>{isHank ? '🪠' : initials(m.from_name)}</div>
              <div className={blinkClass} style={{ maxWidth: '80%', padding: '8px 11px', borderRadius: 12, background: mine ? 'rgba(255,179,0,0.12)' : 'var(--surface-2)', border: `1px solid ${bubbleBorder}` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: isHank ? 'var(--purple, #9c64f4)' : 'var(--fg-2)' }}>{m.from_name || 'Someone'}{tagBadge} <span className="muted" style={{ fontWeight: 400 }}>· {fmt(m.created_at)}</span></div>
                <div style={{ fontSize: 13.5, marginTop: 2, whiteSpace: 'pre-wrap' }}>{m.body}</div>
                {(m.tag === 'personal' || m.tag === 'office') && !mine && (
                  <button onClick={() => start(async () => { const r = await ackChat(m.from_name); setMsg(r); router.refresh(); })} disabled={pending} className="pill" style={{ cursor: 'pointer', marginTop: 6, fontSize: 10.5, color: 'var(--green)', border: '1px solid var(--green)' }}>👍 On it</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

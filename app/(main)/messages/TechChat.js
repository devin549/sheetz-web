'use client';

// Tech-side Team Chat (HTML chat pane) — the #sheetz team feed + a post box. Not the office
// Comms Desk (delete / proposed-actions / customer threads). Read the team, drop a line, see Hank's chime.
// The feed is BROKEN DOWN INTO CATEGORIES (matching the HTML's importance grouping): 📌 For You
// (your name's in it) > 🏢 From the Office > 💬 Crew Chatter. Each section is colored to its importance.
import { useRef, useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { postChat, ackChat, markChatRead } from './actions';

const fmt = (iso) => { try { return new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const initials = (n) => String(n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

// The three categories the feed breaks down into, in priority order. Colors map to the importance
// accent (red = address this, blue = office heads-up, amber = general crew). 'general' also holds Hank.
const SECTIONS = [
  { tag: 'personal', label: '📌 For You', hint: 'Your name came up — address these', color: 'var(--red)' },
  { tag: 'office', label: '🏢 From the Office', hint: 'Heads-ups from dispatch & the office', color: 'var(--blue)' },
  { tag: 'general', label: '💬 Crew Chatter', hint: 'The whole crew in #sheetz', color: 'var(--amber)' },
];

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

  // Bucket the feed into the three categories. Within each section we keep the feed's order.
  const buckets = { personal: [], office: [], general: [] };
  messages.forEach((m) => { (buckets[m.tag] || buckets.general).push(m); });

  // One chat bubble (shared by every section).
  const renderMsg = (m, accent) => {
    const mine = String(m.from_name || '').trim().toLowerCase() === String(me).trim().toLowerCase();
    const isHank = /hank/i.test(m.from_name || '');
    const fresh = isNew(m.id) && !mine;
    // Blink color by importance: red = personal (address this), blue = office, amber = general.
    const blinkClass = !fresh ? '' : m.tag === 'personal' ? 'cb-blink-red' : m.tag === 'office' ? 'cb-blink-blue' : 'cb-blink';
    const newBadge = !fresh ? null : <span style={{ color: accent, fontSize: 9, fontWeight: 800 }}> · NEW</span>;
    const bubbleBorder = fresh ? accent : isHank ? 'var(--purple, #9c64f4)' : 'var(--border)';
    return (
      <div key={m.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', flexDirection: mine ? 'row-reverse' : 'row' }}>
        <div style={{ width: 30, height: 30, borderRadius: 999, flexShrink: 0, background: isHank ? 'var(--purple, #9c64f4)' : mine ? 'var(--amber)' : 'var(--surface-3)', color: isHank ? '#fff' : mine ? '#1a1206' : 'var(--fg-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>{isHank ? '🪠' : initials(m.from_name)}</div>
        <div className={blinkClass} style={{ maxWidth: '80%', padding: '8px 11px', borderRadius: 12, background: mine ? 'rgba(255,179,0,0.12)' : 'var(--surface-2)', border: `1px solid ${bubbleBorder}` }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: isHank ? 'var(--purple, #9c64f4)' : 'var(--fg-2)' }}>{m.from_name || 'Someone'}{newBadge} <span className="muted" style={{ fontWeight: 400 }}>· {fmt(m.created_at)}</span></div>
          <div style={{ fontSize: 13.5, marginTop: 2, whiteSpace: 'pre-wrap' }}>{m.body}</div>
          {(m.tag === 'personal' || m.tag === 'office') && !mine && (
            <button onClick={() => start(async () => { const r = await ackChat(m.from_name); setMsg(r); router.refresh(); })} disabled={pending} className="pill" style={{ cursor: 'pointer', marginTop: 6, fontSize: 10.5, color: 'var(--green)', border: '1px solid var(--green)' }}>👍 On it</button>
          )}
        </div>
      </div>
    );
  };

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

      {/* feed — broken down by category */}
      {messages.length === 0 && <div className="card" style={{ marginTop: 12 }}><span className="muted">No team messages yet. Say hi 👋</span></div>}

      {messages.length > 0 && SECTIONS.map((s) => {
        const list = buckets[s.tag];
        if (!list || list.length === 0) return null;
        return (
          <div key={s.tag} style={{ marginTop: 16 }}>
            {/* section header — colored to the category's importance */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 2px 8px', borderBottom: `2px solid ${s.color}`, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: s.color, textTransform: 'uppercase', letterSpacing: 0.4 }}>{s.label}</span>
              <span className="pill" style={{ fontSize: 10, color: s.color, border: `1px solid ${s.color}` }}>{list.length}</span>
              <span className="muted" style={{ fontSize: 10.5, marginLeft: 'auto' }}>{s.hint}</span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {list.map((m) => renderMsg(m, s.color))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

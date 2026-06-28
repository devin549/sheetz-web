'use client';

// Tech-side Team Chat — the #sheetz team feed, reorganized so it stays clean as it grows:
//   • 📌 NEEDS YOU band pinned on top  — anything with your name in it, with its actions right there.
//   • Tabs (All / 🏢 Office / 💬 Crew / ✓ Resolved) keep the noise filtered.
//   • Sender grouping — consecutive lines from the same person collapse under one header (no repeated avatars).
//   • Threaded replies — a reply nests UNDER the message it answers (reply_to) with a connector line.
//   • Per-tech Resolve — clears a line from YOUR chat only (rides in your prefs), never the shared feed.
//   • Ask Hank — now skims the chat history, so "where's the camera / who's got my tools?" gets answered.
import { useRef, useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { postChat, replyChat, resolveChatForMe, ackChat, markChatRead, askHank, hankReadFeed } from './actions';

const fmt = (iso) => { try { return new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const initials = (n) => String(n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const accentFor = (tag) => (tag === 'personal' ? 'var(--red)' : tag === 'office' ? 'var(--blue)' : 'var(--amber)');

export default function TechChat({ messages = [], me = '', resolvedIds = [] }) {
  const router = useRouter();
  const formRef = useRef(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [tab, setTab] = useState('all'); // all | office | crew | resolved
  const [replyTo, setReplyTo] = useState(null); // message id we're replying to (inline composer)
  const [replyText, setReplyText] = useState('');
  // 🪠 Ask Hank — question box + "read #sheetz", same as before (Hank's the smart part now).
  const [hankOpen, setHankOpen] = useState(false);
  const [hankQ, setHankQ] = useState('');
  const [hankPost, setHankPost] = useState(false);
  const [hankA, setHankA] = useState(null);
  const [asking, startAsk] = useTransition();
  const [reading, startRead] = useTransition();
  const ask = (e) => { e.preventDefault(); if (!hankQ.trim()) return; setHankA(null); startAsk(async () => { const r = await askHank(hankQ, hankPost); setHankA(r); if (r.ok && hankPost) router.refresh(); }); };
  const readFeed = () => { setHankA(null); startRead(async () => { const r = await hankReadFeed(); setHankA({ ok: r.ok, answer: r.msg, msg: r.msg }); if (r.ok) router.refresh(); }); };
  // Opening the chat marks it read → clears the sidebar Chat badge/blink.
  useEffect(() => { markChatRead().then(() => router.refresh()).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Auto-sync: re-pull every 20s so new chatter shows without a manual refresh.
  useEffect(() => { const id = setInterval(() => router.refresh(), 20000); return () => clearInterval(id); }, [router]);
  // Blink: messages not on screen at mount get a one-time highlight.
  const seen = useRef(new Set(messages.map((m) => m.id)));
  const isNew = (id) => !seen.current.has(id);
  useEffect(() => { messages.forEach((m) => seen.current.add(m.id)); });

  const resolvedSet = new Set(resolvedIds || []);
  const lc = (s) => String(s || '').trim().toLowerCase();
  const mineMsg = (m) => lc(m.from_name) === lc(me);

  // ── Threading: a message is a reply if its reply_to matches another message's id or provider_id. ──
  const byId = {}; const byProvider = {};
  messages.forEach((m) => { byId[m.id] = m; if (m.provider_id) byProvider[m.provider_id] = m; });
  const parentOf = (m) => (m.reply_to ? (byId[m.reply_to] || byProvider[m.reply_to] || null) : null);
  const childrenOf = {};
  messages.forEach((m) => { const p = parentOf(m); if (p) (childrenOf[p.id] = childrenOf[p.id] || []).push(m); });
  const topLevel = messages.filter((m) => !parentOf(m)); // ascending order preserved

  // Pinned "Needs you" = your-name-in-it, unresolved, not your own. The rest filter by tab below.
  const pinned = topLevel.filter((m) => m.tag === 'personal' && !mineMsg(m) && !resolvedSet.has(m.id));
  const pinnedIds = new Set(pinned.map((m) => m.id));

  const count = {
    all: topLevel.filter((m) => !resolvedSet.has(m.id) && !pinnedIds.has(m.id)).length,
    office: topLevel.filter((m) => m.tag === 'office' && !resolvedSet.has(m.id)).length,
    crew: topLevel.filter((m) => m.tag === 'general' && !resolvedSet.has(m.id)).length,
    resolved: topLevel.filter((m) => resolvedSet.has(m.id)).length,
  };
  const TABS = [
    { k: 'all', label: '💬 All', color: 'var(--amber)' },
    { k: 'office', label: '🏢 Office', color: 'var(--blue)' },
    { k: 'crew', label: '💬 Crew', color: 'var(--amber)' },
    { k: 'resolved', label: '✓ Resolved', color: 'var(--green)' },
  ];
  const shown = topLevel.filter((m) => {
    if (tab === 'resolved') return resolvedSet.has(m.id);
    if (resolvedSet.has(m.id)) return false;
    if (tab === 'office') return m.tag === 'office';
    if (tab === 'crew') return m.tag === 'general';
    return !pinnedIds.has(m.id); // 'all'
  });

  const send = (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); setMsg(null); start(async () => { const r = await postChat(fd); setMsg(r); if (r.ok) { formRef.current?.reset(); router.refresh(); } }); };
  const onIt = (fromName) => start(async () => { const r = await ackChat(fromName); setMsg(r); router.refresh(); });
  const resolve = (id, done) => start(async () => { const r = await resolveChatForMe(id, done); setMsg(r); router.refresh(); });
  const sendReply = (parentId) => { const body = replyText.trim(); if (!body) return; start(async () => { const r = await replyChat(parentId, body); setMsg(r); if (r.ok) { setReplyTo(null); setReplyText(''); router.refresh(); } }); };

  // ── One message bubble. `grouped` hides the avatar/name header (same sender as the line above). ──
  const Bubble = ({ m, grouped, child }) => {
    const mine = mineMsg(m);
    const isHank = /hank/i.test(m.from_name || '');
    const fresh = isNew(m.id) && !mine;
    const accent = accentFor(m.tag);
    const blinkClass = !fresh ? '' : m.tag === 'personal' ? 'cb-blink-red' : m.tag === 'office' ? 'cb-blink-blue' : 'cb-blink';
    const showActions = !mine && !child;
    return (
      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', flexDirection: mine ? 'row-reverse' : 'row', marginTop: grouped ? 2 : 8 }}>
        <div style={{ width: grouped ? 30 : 30, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
          {!grouped && <div style={{ width: 30, height: 30, borderRadius: 999, background: isHank ? 'var(--purple, #9c64f4)' : mine ? 'var(--amber)' : 'var(--surface-3)', color: isHank ? '#fff' : mine ? '#1a1206' : 'var(--fg-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>{isHank ? '🪠' : initials(m.from_name)}</div>}
        </div>
        <div style={{ maxWidth: '82%' }}>
          <div className={blinkClass} style={{ padding: '7px 11px', borderRadius: 12, background: mine ? 'rgba(255,179,0,0.12)' : 'var(--surface-2)', border: `1px solid ${fresh ? accent : isHank ? 'var(--purple, #9c64f4)' : 'var(--border)'}` }}>
            {!grouped && <div style={{ fontSize: 11, fontWeight: 800, color: isHank ? 'var(--purple, #9c64f4)' : 'var(--fg-2)' }}>{m.from_name || 'Someone'}{fresh && <span style={{ color: accent, fontSize: 9, fontWeight: 800 }}> · NEW</span>} <span className="muted" style={{ fontWeight: 400 }}>· {fmt(m.created_at)}</span></div>}
            <div style={{ fontSize: 13.5, marginTop: grouped ? 0 : 2, whiteSpace: 'pre-wrap' }}>{m.body}</div>
          </div>
          {showActions && (
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              <button onClick={() => { setReplyTo(replyTo === m.id ? null : m.id); setReplyText(''); }} disabled={pending} className="pill" style={{ cursor: 'pointer', fontSize: 10.5, color: 'var(--fg-2)' }}>↪ Reply</button>
              {(m.tag === 'personal' || m.tag === 'office') && <button onClick={() => onIt(m.from_name)} disabled={pending} className="pill" style={{ cursor: 'pointer', fontSize: 10.5, color: 'var(--green)', border: '1px solid var(--green)' }}>👍 On it</button>}
              {tab === 'resolved'
                ? <button onClick={() => resolve(m.id, false)} disabled={pending} className="pill" style={{ cursor: 'pointer', fontSize: 10.5, color: 'var(--blue)' }}>↺ Unresolve</button>
                : <button onClick={() => resolve(m.id, true)} disabled={pending} className="pill" style={{ cursor: 'pointer', fontSize: 10.5, color: 'var(--muted, #888)' }}>✓ Resolve</button>}
            </div>
          )}
          {replyTo === m.id && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'flex-end' }}>
              <textarea autoFocus value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={1} placeholder={`Reply to ${String(m.from_name || '').split(/\s+/)[0]}…`} style={{ flex: 1, resize: 'vertical', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '6px 9px', fontSize: 13 }} />
              <button onClick={() => sendReply(m.id)} disabled={pending || !replyText.trim()} className="btn" style={{ fontSize: 12, padding: '6px 11px' }}>{pending ? '…' : 'Send'}</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // A top-level message + its nested replies (the thread). Children render with a connector rail.
  const Thread = ({ m, grouped }) => {
    const kids = (childrenOf[m.id] || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return (
      <div>
        <Bubble m={m} grouped={grouped} />
        {kids.length > 0 && (
          <div style={{ marginLeft: 36, borderLeft: '2px solid var(--border)', paddingLeft: 10, marginTop: 2 }}>
            {kids.map((k) => <Bubble key={k.id} m={k} child />)}
          </div>
        )}
      </div>
    );
  };

  // Render a list with sender grouping (consecutive same-sender top-level lines drop their header).
  const renderList = (list) => {
    let lastSender = null;
    return list.map((m) => {
      const grouped = lastSender !== null && lc(m.from_name) === lastSender && (childrenOf[m.id] || []).length === 0;
      lastSender = lc(m.from_name);
      return <Thread key={m.id} m={m} grouped={grouped} />;
    });
  };

  return (
    <div className="wrap" style={{ maxWidth: 640 }}>
      <div className="h1" style={{ fontSize: 20 }}>👥 Team Chat</div>
      <p className="muted" style={{ fontSize: 12.5 }}>The whole crew + office in #sheetz. Quick question, status, or a heads-up — everyone sees it. 🪠 Hank chimes in when he can help.</p>

      {/* 🪠 ASK HANK */}
      <div style={{ margin: '8px 0 4px' }}>
        <button onClick={() => setHankOpen((o) => !o)} className="pill" style={{ cursor: 'pointer', fontSize: 12, fontWeight: 800, color: '#c8a8ff', border: '1px solid #9c64f4', background: 'linear-gradient(135deg,rgba(156,100,244,0.12),rgba(156,100,244,0.03))', textTransform: 'uppercase', letterSpacing: 0.5 }}>🪠 Ask Hank {hankOpen ? '▲' : '▾'}</button>
      </div>
      {hankOpen && (
        <form onSubmit={ask} className="card" style={{ display: 'grid', gap: 9, maxWidth: 620, marginBottom: 12, border: '1px solid #9c64f4', background: 'linear-gradient(135deg,rgba(156,100,244,0.10),rgba(156,100,244,0.02))' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#c8a8ff', textTransform: 'uppercase', letterSpacing: 0.5 }}>🪠 Ask Hank</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={hankQ} onChange={(e) => setHankQ(e.target.value)} placeholder="Where's the big reel at? · Who's got the camera near me?" style={{ flex: '1 1 240px', background: 'var(--surface-2)', border: '1px solid #9c64f4', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
            <button type="submit" className="btn" disabled={asking || !hankQ.trim()} style={{ background: 'linear-gradient(135deg,#9c64f4,#7b3ff0)', border: 'none', color: '#fff', fontWeight: 700, opacity: (asking || !hankQ.trim()) ? 0.6 : 1 }}>{asking ? 'Thinking…' : 'Ask'}</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-2)', cursor: 'pointer' }}><input type="checkbox" checked={hankPost} onChange={(e) => setHankPost(e.target.checked)} /> Post answer to #sheetz</label>
            <button type="button" onClick={readFeed} disabled={reading} className="pill" style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#c8a8ff', border: '1px solid #9c64f4', opacity: reading ? 0.6 : 1 }}>{reading ? 'Reading…' : '🪠 Hank, read #sheetz'}</button>
          </div>
          {hankA && <div style={{ fontSize: 13.5, lineHeight: 1.5, padding: '9px 11px', borderRadius: 8, background: 'var(--surface-2)', borderLeft: `3px solid ${hankA.ok ? '#9c64f4' : 'var(--red)'}` }}>{hankA.ok ? <><strong style={{ color: '#c8a8ff' }}>🪠 Hank:</strong> {hankA.answer}</> : <span style={{ color: 'var(--red)' }}>{hankA.msg}</span>}</div>}
        </form>
      )}

      {/* post box */}
      <form ref={formRef} onSubmit={send} className="card card-amber" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', maxWidth: 620 }}>
        <textarea name="text" rows={2} required placeholder="Message the team…" style={{ flex: 1, resize: 'vertical', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 }} />
        <button className="btn" type="submit" disabled={pending}>{pending ? '…' : 'Send'}</button>
      </form>
      {msg && <div style={{ fontSize: 12, margin: '6px 0', color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}

      {messages.length === 0 && <div className="card" style={{ marginTop: 12 }}><span className="muted">No team messages yet. Say hi 👋</span></div>}

      {/* 📌 NEEDS YOU — your-name-in-it, pinned on top with actions right there. */}
      {pinned.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6 }}>📌 Needs you <span className="pill" style={{ fontSize: 10, color: 'var(--red)', border: '1px solid var(--red)' }}>{pinned.length}</span></div>
          <div style={{ display: 'grid', gap: 4, padding: '10px 11px', borderRadius: 12, border: '1px solid var(--red)', background: 'color-mix(in oklab, var(--red) 7%, var(--surface-1))' }}>
            {renderList(pinned)}
          </div>
        </div>
      )}

      {/* tabs → one clean board below */}
      {messages.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 9, marginBottom: 12 }}>
            {TABS.map((t) => {
              const on = tab === t.k;
              return (
                <button key={t.k} onClick={() => setTab(t.k)} style={{ cursor: 'pointer', fontSize: 12, fontWeight: on ? 800 : 600, padding: '6px 11px', borderRadius: 20, whiteSpace: 'nowrap',
                  border: `1px solid ${on ? t.color : 'var(--border)'}`, color: on ? t.color : 'var(--fg-2)',
                  background: on ? `color-mix(in oklab, ${t.color} 14%, var(--surface-2))` : 'var(--surface-2)' }}>
                  {t.label} <span style={{ opacity: 0.85, fontWeight: 800 }}>{count[t.k]}</span>
                </button>
              );
            })}
          </div>
          {shown.length === 0
            ? <div className="muted" style={{ fontSize: 12.5, padding: '8px 2px', fontStyle: 'italic' }}>{tab === 'resolved' ? 'Nothing resolved — your chat is clear. 🧹' : 'Nothing in here right now.'}</div>
            : <div style={{ display: 'grid', gap: 2 }}>{renderList(shown)}</div>}
        </div>
      )}
    </div>
  );
}

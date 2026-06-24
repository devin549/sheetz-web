'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { postTeamMessage, syncDiscordNow, deleteMessage, askHank, hankReadFeed } from './actions';
import { Send, Phone, Mail, MessageSquare, RefreshCw, X, ArrowDownLeft, ArrowUpRight, Wrench } from 'lucide-react';

const dt = (s) => { try { return new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const CHAN = {
  discord: { icon: <MessageSquare size={13} />, label: '#sheetz', color: 'var(--accent)' },
  sms: { icon: <Phone size={13} />, label: 'SMS', color: 'var(--green)' },
  email: { icon: <Mail size={13} />, label: 'Email', color: 'var(--amber)' },
};

export default function MessagesClient({ comms, discordReady, readReady, canDelete, commsMissing }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [syncing, startSync] = useTransition();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const [sync, setSync] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [hankQ, setHankQ] = useState('');
  const [hankA, setHankA] = useState(null);
  const [hankPost, setHankPost] = useState(false);
  const [asking, startAsk] = useTransition();
  const [reading, startRead] = useTransition();

  function ask(e) {
    e.preventDefault();
    if (!hankQ.trim()) return;
    setHankA(null);
    startAsk(async () => { const r = await askHank(hankQ, hankPost); setHankA(r); if (r.ok && hankPost) router.refresh(); });
  }

  function readFeed() {
    setHankA(null);
    startRead(async () => { const r = await hankReadFeed(); setHankA({ ok: r.ok, answer: r.msg }); if (r.ok) router.refresh(); });
  }

  function post(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const fd = new FormData(); fd.set('text', text);
    setMsg(null);
    start(async () => { const r = await postTeamMessage(fd); setMsg(r); if (r.ok) { setText(''); router.refresh(); } });
  }

  function pull() {
    setSync(null);
    startSync(async () => { const r = await syncDiscordNow(); setSync(r); if (r.ok) router.refresh(); });
  }

  function remove(id) {
    if (busyId) return;
    setBusyId(id);
    start(async () => { const r = await deleteMessage(id); setBusyId(null); if (r.ok) router.refresh(); else setSync(r); });
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

      {/* Hank — the plumber-AI teammate. Ask him anything from live data, or have him read the feed. */}
      <form onSubmit={ask} className="card" style={{ display: 'grid', gap: 8, marginBottom: 16, border: '1px solid var(--accent)', background: 'var(--surface-1)' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Wrench size={13} /> Ask Hank</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={hankQ} onChange={(e) => setHankQ(e.target.value)} placeholder="e.g. Who's free for a 2-man job? · What's open in Lexington today?" style={{ flex: '1 1 280px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit' }} />
          <button type="submit" className="btn" disabled={asking || !hankQ.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: (asking || !hankQ.trim()) ? 0.6 : 1 }}><Wrench size={14} /> {asking ? 'Thinking…' : 'Ask'}</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={hankPost} onChange={(e) => setHankPost(e.target.checked)} /> Post Hank’s answer to #sheetz
          </label>
          <button type="button" onClick={readFeed} disabled={reading} className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px', opacity: reading ? 0.6 : 1 }} title="Hank reads the newest #sheetz messages and replies where he can help">
            <MessageSquare size={13} /> {reading ? 'Reading…' : 'Have Hank read #sheetz'}
          </button>
        </div>
        {hankA && <div style={{ fontSize: 13.5, lineHeight: 1.5, padding: '9px 11px', borderRadius: 8, background: 'var(--surface-2)', borderLeft: `3px solid ${hankA.ok ? 'var(--accent)' : 'var(--red)'}` }}>{hankA.ok ? <><strong style={{ color: 'var(--accent)' }}>🔧 Hank:</strong> {hankA.answer}{hankA.posted && <span className="muted" style={{ fontSize: 11 }}> · posted to #sheetz</span>}</> : <span style={{ color: 'var(--red)' }}>{hankA.msg}</span>}</div>}
      </form>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '0 0 8px', flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: 12, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.05em', margin: 0 }}>Recent messages</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {sync && <span style={{ fontSize: 12, fontWeight: 700, color: sync.ok ? 'var(--green)' : 'var(--red)' }}>{sync.msg}</span>}
          <button onClick={pull} disabled={syncing} className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px', opacity: syncing ? 0.6 : 1 }} title={readReady ? 'Pull #sheetz chatter into the feed' : 'Needs DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID'}>
            <RefreshCw size={13} style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} /> {syncing ? 'Syncing…' : 'Sync from Discord'}
          </button>
        </div>
      </div>
      {!readReady && <div className="notice" style={{ fontSize: 12, marginBottom: 8 }}>To read #sheetz replies back here, add a Discord bot: set <code>DISCORD_BOT_TOKEN</code> + <code>DISCORD_CHANNEL_ID</code> in Vercel (the webhook only sends).</div>}
      {commsMissing && <div className="notice" style={{ fontSize: 12 }}>Comms log needs its table — run <code>supabase/41_comms.sql</code>.</div>}
      {!commsMissing && !comms.length && <div className="card"><span className="muted">Nothing yet — booking alerts, texts, emails, and #sheetz replies will show here.</span></div>}
      <div style={{ display: 'grid', gap: 6 }}>
        {comms.map((m) => {
          const ch = CHAN[m.channel] || { icon: null, label: m.channel, color: 'var(--fg-3)' };
          const inbound = m.direction === 'in';
          const who = m.from_name || m.sent_by || (inbound ? 'Discord' : '');
          return (
            <div key={m.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', flexWrap: 'wrap', opacity: m.status === 'failed' ? 0.6 : 1, borderLeft: inbound ? '3px solid var(--accent)' : '3px solid transparent' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: ch.color, minWidth: 64 }}>{ch.icon} {ch.label}</span>
            {who && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, color: 'var(--fg-1)' }}>{inbound ? <ArrowDownLeft size={12} style={{ color: 'var(--accent)' }} /> : <ArrowUpRight size={12} style={{ color: 'var(--fg-3)' }} />}{who}</span>}
            <span style={{ flex: '1 1 200px', fontSize: 13, minWidth: 0 }}>{m.body}</span>
            {m.status === 'failed' && <span className="pill pill-red" style={{ fontSize: 10 }}>failed</span>}
            <span className="muted" style={{ fontSize: 11 }}>{dt(m.created_at)}</span>
            {canDelete && <button onClick={() => remove(m.id)} disabled={busyId === m.id} title="Remove from feed" aria-label="Remove from feed" className="btn-icon" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', display: 'inline-flex', padding: 2, opacity: busyId === m.id ? 0.4 : 1 }}><X size={14} /></button>}
            </div>
          );
        })}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

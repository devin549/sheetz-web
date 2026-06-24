'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { postTeamMessage, syncDiscordNow, askHank, hankReadFeed, resolveMessage, employeeCard, applyReschedule, dismissAction, sendRescheduleNotice, meetingAckStatus, nudgeMeetingNonResponders } from './actions';
import { labelFor, LABELS, ACTIONABLE, initials, avatarHue } from '@/lib/commsTriage';
import { Send, RefreshCw, Wrench, Check, RotateCcw, MessageSquarePlus, ArrowUpRight, ArrowRight, Phone, MessageSquare, MapPin, X, CalendarClock, ThumbsUp, Bell } from 'lucide-react';

const dt = (s) => { try { return new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const tm = (s) => { try { return new Date(s).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const HANK = 'Pipe Wrench Hank';

function dayBucket(iso) {
  const d = new Date(iso); const now = new Date();
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (same(d, now)) return 'Today';
  if (same(d, y)) return 'Yesterday';
  return 'Older';
}

function Avatar({ name, photo, isHank }) {
  const sz = 34;
  const base = { width: sz, height: sz, borderRadius: '50%', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12.5, color: '#fff', overflow: 'hidden' };
  if (isHank) return <div style={{ ...base, background: 'linear-gradient(135deg,var(--accent),#b5651d)' }}><Wrench size={17} /></div>;
  if (photo) return <img src={photo} alt={name} width={sz} height={sz} style={{ ...base, objectFit: 'cover' }} />;
  const hue = avatarHue(name);
  return <div style={{ ...base, background: `hsl(${hue} 45% 42%)` }}>{initials(name)}</div>;
}

export default function CommsDeskClient({ comms, people, actions = [], discordReady, readReady, canDelete, commsMissing }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [syncing, startSync] = useTransition();
  const [asking, startAsk] = useTransition();
  const [reading, startRead] = useTransition();
  const [panel, setPanel] = useState(null);          // 'post' | 'hank' | null
  const [filter, setFilter] = useState('action');     // action | all | <labelKey> | resolved
  const [text, setText] = useState('');
  const [hankQ, setHankQ] = useState('');
  const [hankPost, setHankPost] = useState(false);
  const [hankA, setHankA] = useState(null);
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [card, setCard] = useState(null);             // { loading } | employee-card data
  const [cardLoad, startCard] = useTransition();
  const [actBusy, setActBusy] = useState(null);
  const [drafts, setDrafts] = useState({});           // actionId -> { draft } after confirm
  const [actGone, setActGone] = useState({});         // actionId -> true once handled
  const [acks, setAcks] = useState({});               // commsId -> ack status
  const [ackBusy, setAckBusy] = useState(null);

  function checkAcks(id) { if (ackBusy) return; setAckBusy(id); start(async () => { const r = await meetingAckStatus(id); setAckBusy(null); setAcks((a) => ({ ...a, [id]: r })); }); }
  function nudgeMtg(id) { if (ackBusy) return; setAckBusy(id); start(async () => { const r = await nudgeMeetingNonResponders(id); setAckBusy(null); setToast(r); checkAcks(id); }); }

  function confirmAction(id) { if (actBusy) return; setActBusy(id); start(async () => { const r = await applyReschedule(id); setActBusy(null); if (r.ok) { setDrafts((d) => ({ ...d, [id]: r.draft })); router.refresh(); } else setToast(r); }); }
  function dropAction(id) { if (actBusy) return; setActBusy(id); start(async () => { const r = await dismissAction(id); setActBusy(null); setActGone((g) => ({ ...g, [id]: true })); router.refresh(); if (!r.ok) setToast(r); }); }
  function sendNotice(id) { if (actBusy) return; setActBusy(id); start(async () => { const r = await sendRescheduleNotice(id); setActBusy(null); setToast(r); setDrafts((d) => { const n = { ...d }; delete n[id]; return n; }); }); }

  function openCard(name) { setCard({ loading: true, name }); startCard(async () => { const r = await employeeCard(name); setCard(r && r.ok ? r : { error: true, name }); }); }
  function mention(name) { setCard(null); setPanel('post'); setText((t) => (t ? t : `@${name} `)); }

  // Match a sender to a teammate (Discord name → name) for the avatar.
  const personOf = useMemo(() => {
    const byDiscord = {}, byName = {};
    (people || []).forEach((p) => { if (p.discord_name) byDiscord[p.discord_name.toLowerCase()] = p; byName[p.name.toLowerCase()] = p; });
    return (sender) => { const k = String(sender || '').toLowerCase(); return byDiscord[k] || byName[k] || null; };
  }, [people]);

  // Decorate every message with label + bucket + avatar.
  const rows = useMemo(() => (comms || []).map((m) => {
    const inbound = m.direction === 'in';
    const isHank = (m.from_name || m.sent_by) === HANK;
    const who = m.from_name || m.sent_by || (inbound ? 'crew' : 'office');
    const label = inbound && !isHank ? labelFor(m.body) : null;
    const p = personOf(who);
    return { ...m, inbound, isHank, who, label, photo: p && p.photo_url, attachments: Array.isArray(m.attachments) ? m.attachments : [], resolved: !!m.resolved_at };
  }), [comms, personOf]);

  const open = rows.filter((r) => !r.resolved);
  const counts = {
    action: open.filter((r) => r.label && ACTIONABLE.has(r.label)).length,
    helper: open.filter((r) => r.label === 'helper').length,
    shop: open.filter((r) => r.label === 'tool' || r.label === 'fuel_shop').length,
    urgent: open.filter((r) => r.label === 'urgent').length,
  };

  const shown = useMemo(() => {
    let list = rows;
    if (filter === 'resolved') list = rows.filter((r) => r.resolved);
    else { list = rows.filter((r) => !r.resolved);
      if (filter === 'action') list = list.filter((r) => r.label && ACTIONABLE.has(r.label));
      else if (filter !== 'all') list = list.filter((r) => r.label === filter);
    }
    return list;
  }, [rows, filter]);

  const groups = useMemo(() => {
    const g = { Today: [], Yesterday: [], Older: [] };
    shown.forEach((r) => g[dayBucket(r.created_at)].push(r));
    return g;
  }, [shown]);

  function post(e) { e.preventDefault(); if (!text.trim()) return; const fd = new FormData(); fd.set('text', text); setToast(null); start(async () => { const r = await postTeamMessage(fd); setToast(r); if (r.ok) { setText(''); setPanel(null); router.refresh(); } }); }
  function pull() { setToast(null); startSync(async () => { const r = await syncDiscordNow(); setToast(r); if (r.ok) router.refresh(); }); }
  function ask(e) { e.preventDefault(); if (!hankQ.trim()) return; setHankA(null); startAsk(async () => { const r = await askHank(hankQ, hankPost); setHankA(r); if (r.ok && hankPost) router.refresh(); }); }
  function readFeed() { setHankA(null); startRead(async () => { const r = await hankReadFeed(); setHankA({ ok: r.ok, answer: r.msg }); if (r.ok) router.refresh(); }); }
  function resolve(id, done) { if (busyId) return; setBusyId(id); start(async () => { const r = await resolveMessage(id, done); setBusyId(null); if (r.ok) router.refresh(); else setToast(r); }); }

  const FILTERS = [
    { k: 'action', label: `Needs action${counts.action ? ` · ${counts.action}` : ''}` },
    { k: 'all', label: 'All' },
    { k: 'meeting', label: '📅 Meeting' },
    { k: 'helper', label: 'Helper' }, { k: 'tool', label: 'Tool' }, { k: 'fuel_shop', label: 'Fuel/shop' },
    { k: 'customer', label: 'Customer' }, { k: 'schedule', label: 'Schedule' }, { k: 'urgent', label: 'Urgent' },
    { k: 'resolved', label: 'Resolved' },
  ];
  const stat = (label, n, color) => <div style={{ display: 'flex', flexDirection: 'column', minWidth: 78 }}><span style={{ fontSize: 22, fontWeight: 800, color: n ? color : 'var(--fg-3)' }}>{n}</span><span className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span></div>;
  const btn = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '6px 11px' };

  return (
    <>
      {/* Counts + toolbar — reading-first; composing tucked behind buttons. */}
      <div className="card card-amber" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {stat('needs action', counts.action, 'var(--amber)')}
          {stat('helper', counts.helper, '#f5a524')}
          {stat('shop/tool', counts.shop, '#30a46c')}
          {stat('urgent', counts.urgent, '#e5484d')}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setPanel((p) => p === 'hank' ? null : 'hank')} className="btn btn-ghost" style={btn}><Wrench size={14} /> Ask Hank</button>
          <button onClick={pull} disabled={syncing} className="btn btn-ghost" style={{ ...btn, opacity: syncing ? 0.6 : 1 }} title={readReady ? 'Pull #sheetz into the desk' : 'Needs DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID'}><RefreshCw size={13} style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} /> {syncing ? 'Syncing…' : 'Sync'}</button>
          <button onClick={() => setPanel((p) => p === 'post' ? null : 'post')} className="btn" style={btn}><MessageSquarePlus size={14} /> Post</button>
        </div>
      </div>
      {toast && <div style={{ fontSize: 12.5, fontWeight: 700, color: toast.ok ? 'var(--green)' : 'var(--red)', margin: '-4px 0 10px' }}>{toast.msg}</div>}

      {/* Hank's caught actions — propose → one-tap confirm → drafted customer notice (never auto-sent). */}
      {actions.filter((a) => !actGone[a.id]).map((a) => {
        const draft = drafts[a.id];
        return (
          <div key={a.id} className="card" style={{ marginBottom: 10, border: '1px solid var(--accent)', background: 'var(--surface-1)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
              <CalendarClock size={18} style={{ color: 'var(--accent)', flex: '0 0 auto', marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.04em' }}>🔧 Hank caught a reschedule</div>
                <div style={{ fontSize: 13.5, marginTop: 3, lineHeight: 1.45 }}>{a.summary}</div>
                {!draft ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
                    <button onClick={() => confirmAction(a.id)} disabled={actBusy === a.id} className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '6px 12px' }}><Check size={14} /> {actBusy === a.id ? 'Moving…' : 'Confirm reschedule'}</button>
                    <button onClick={() => dropAction(a.id)} disabled={actBusy === a.id} className="btn btn-ghost" style={{ fontSize: 12.5, padding: '6px 12px' }}>Dismiss</button>
                  </div>
                ) : (
                  <div style={{ marginTop: 9 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>✓ Job moved. Customer notice drafted (not sent):</div>
                    <div style={{ fontSize: 12.5, padding: '8px 10px', borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--border)', lineHeight: 1.4 }}>{draft}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => sendNotice(a.id)} disabled={actBusy === a.id} className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '6px 12px' }}><Send size={14} /> {actBusy === a.id ? 'Sending…' : 'Send to customer'}</button>
                      <button onClick={() => setActGone((g) => ({ ...g, [a.id]: true }))} className="btn btn-ghost" style={{ fontSize: 12.5, padding: '6px 12px' }}>Skip — I’ll tell them</button>
                    </div>
                    <div className="muted" style={{ fontSize: 10.5, marginTop: 5 }}>Send is consent-gated (texts only if the customer opted in) and logged.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {panel === 'post' && (
        <form onSubmit={post} className="card" style={{ display: 'grid', gap: 8, marginBottom: 14, border: '1px solid var(--accent)' }}>
          {!discordReady && <div className="notice" style={{ fontSize: 12 }}>Add <code>DISCORD_WEBHOOK_URL</code> to actually post to #sheetz. It still logs here.</div>}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Post to the #sheetz channel…" autoFocus style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />
          <div><button type="submit" className="btn" disabled={pending || !text.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: (pending || !text.trim()) ? 0.6 : 1 }}><Send size={15} /> {pending ? 'Posting…' : 'Post to #sheetz'}</button></div>
        </form>
      )}

      {panel === 'hank' && (
        <form onSubmit={ask} className="card" style={{ display: 'grid', gap: 8, marginBottom: 14, border: '1px solid var(--accent)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={hankQ} onChange={(e) => setHankQ(e.target.value)} placeholder="Who's free for a 2-man job? · Who has the camera near me?" autoFocus style={{ flex: '1 1 260px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit' }} />
            <button type="submit" className="btn" disabled={asking || !hankQ.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: (asking || !hankQ.trim()) ? 0.6 : 1 }}><Wrench size={14} /> {asking ? 'Thinking…' : 'Ask'}</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-2)', cursor: 'pointer' }}><input type="checkbox" checked={hankPost} onChange={(e) => setHankPost(e.target.checked)} /> Post answer to #sheetz</label>
            <button type="button" onClick={readFeed} disabled={reading} className="btn btn-ghost" style={{ ...btn, opacity: reading ? 0.6 : 1 }}>{reading ? 'Reading…' : 'Have Hank read #sheetz'}</button>
          </div>
          {hankA && <div style={{ fontSize: 13.5, lineHeight: 1.5, padding: '9px 11px', borderRadius: 8, background: 'var(--surface-2)', borderLeft: `3px solid ${hankA.ok ? 'var(--accent)' : 'var(--red)'}` }}>{hankA.ok ? <><strong style={{ color: 'var(--accent)' }}>🔧 {HANK}:</strong> {hankA.answer}{hankA.posted && <span className="muted" style={{ fontSize: 11 }}> · posted</span>}</> : <span style={{ color: 'var(--red)' }}>{hankA.msg}</span>}</div>}
        </form>
      )}

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button key={f.k} onClick={() => setFilter(f.k)} className="pill" style={{ cursor: 'pointer', fontSize: 12, fontWeight: filter === f.k ? 800 : 600, background: filter === f.k ? 'var(--accent)' : 'var(--surface-2)', color: filter === f.k ? '#fff' : 'var(--fg-2)' }}>{f.label}</button>
        ))}
      </div>

      {!readReady && <div className="notice" style={{ fontSize: 12, marginBottom: 10 }}>To read #sheetz replies in here, add a Discord bot: <code>DISCORD_BOT_TOKEN</code> + <code>DISCORD_CHANNEL_ID</code> in Vercel.</div>}
      {commsMissing && <div className="notice" style={{ fontSize: 12 }}>Comms log needs its table — run <code>supabase/41_comms.sql</code>.</div>}
      {!commsMissing && !shown.length && <div className="card"><span className="muted">{filter === 'resolved' ? 'Nothing resolved yet.' : filter === 'action' ? 'Nothing needs action — nice. 🎉' : 'Nothing here yet — Sync to pull #sheetz.'}</span></div>}

      {['Today', 'Yesterday', 'Older'].map((bucket) => groups[bucket].length > 0 && (
        <div key={bucket} style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 11, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 8px' }}>{bucket}</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {groups[bucket].map((m) => {
              const L = m.label && LABELS[m.label];
              return (
                <div key={m.id} className="card" style={{ display: 'flex', gap: 11, padding: '10px 13px', alignItems: 'flex-start', opacity: m.resolved ? 0.55 : 1, borderLeft: m.label === 'urgent' ? '3px solid #e5484d' : (m.inbound ? '3px solid var(--accent)' : '3px solid transparent') }}>
                  {m.isHank
                    ? <Avatar name={m.who} photo={m.photo} isHank />
                    : <button onClick={() => openCard(m.who)} title={`${m.who} — quick card`} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', borderRadius: '50%' }}><Avatar name={m.who} photo={m.photo} /></button>}
                  <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5 }}>{m.who}</span>
                      {!m.inbound && <ArrowUpRight size={12} style={{ color: 'var(--fg-3)' }} />}
                      {L && <span className="pill" style={{ fontSize: 10, fontWeight: 800, background: L.color, color: '#fff', padding: '1px 7px' }}>{L.label}</span>}
                      {m.status === 'failed' && <span className="pill pill-red" style={{ fontSize: 10 }}>failed</span>}
                    </div>
                    {m.body && <div style={{ fontSize: 13.5, marginTop: 2, lineHeight: 1.4, wordBreak: 'break-word' }}>{m.body}</div>}
                    {m.attachments.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                        {m.attachments.map((a, i) => a.image
                          ? <a key={i} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name || 'photo'} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} /></a>
                          : <a key={i} href={a.url} target="_blank" rel="noreferrer" className="pill" style={{ fontSize: 11 }}>📎 {a.name || 'file'}</a>)}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                      <span className="muted" style={{ fontSize: 11 }}>#sheetz · {tm(m.created_at)}</span>
                      {L && !m.resolved && <Link href={L.route.href} className="pill" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--accent)' }}><ArrowRight size={11} /> {L.route.text}</Link>}
                      {m.label === 'meeting' && m.inbound && <button onClick={() => checkAcks(m.id)} disabled={ackBusy === m.id} className="pill" style={{ cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3, color: '#12a594' }}><ThumbsUp size={11} /> {ackBusy === m.id ? 'Checking…' : 'Check 👍'}</button>}
                      {m.inbound && (m.resolved
                        ? <button onClick={() => resolve(m.id, false)} disabled={busyId === m.id} className="pill" style={{ cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}><RotateCcw size={11} /> Re-open</button>
                        : <button onClick={() => resolve(m.id, true)} disabled={busyId === m.id} className="pill" style={{ cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--green)' }}><Check size={12} /> Resolve</button>)}
                    </div>
                    {acks[m.id] && (acks[m.id].ok
                      ? <div style={{ marginTop: 7, padding: '8px 10px', borderRadius: 7, background: 'var(--surface-2)', fontSize: 12.5 }}>
                          <span style={{ fontWeight: 700, color: acks[m.id].missing.length ? 'var(--amber)' : 'var(--green)' }}>{acks[m.id].reacted.length} of {acks[m.id].total} 👍’d</span>
                          {acks[m.id].missing.length > 0 && <>
                            <span className="muted"> · still need: {acks[m.id].missing.join(', ')}</span>
                            <button onClick={() => nudgeMtg(m.id)} disabled={ackBusy === m.id} className="pill" style={{ cursor: 'pointer', fontSize: 11, marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--accent)' }}><Bell size={11} /> @ the stragglers</button>
                          </>}
                          {!acks[m.id].missing.length && <span className="muted"> — everyone’s in 🎉</span>}
                        </div>
                      : <div style={{ marginTop: 7, fontSize: 12, color: 'var(--red)' }}>{acks[m.id].msg}</div>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {card && (
        <div onClick={() => setCard(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 360, width: '100%', position: 'relative', padding: 0, overflow: 'hidden' }}>
            <button onClick={() => setCard(null)} aria-label="Close" style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', padding: 4, zIndex: 1 }}><X size={16} /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 12px', background: 'var(--surface-2)' }}>
              <Avatar name={card.name} photo={card.photo_url} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{card.name}</div>
                <div className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  {card.position && <span style={{ textTransform: 'capitalize' }}>{String(card.position).replace(/_/g, ' ')}</span>}
                  {!card.loading && !card.error && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: card.onShift ? 'var(--green)' : 'var(--fg-3)' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: card.onShift ? 'var(--green)' : 'var(--fg-3)' }} />{card.onShift ? 'On shift' : 'Off shift'}</span>}
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 16px 16px', display: 'grid', gap: 9, fontSize: 13 }}>
              {card.loading && <span className="muted">Loading…</span>}
              {card.error && <span style={{ color: 'var(--red)' }}>Couldn’t load this person.</span>}
              {!card.loading && !card.error && <>
                {card.currentJob
                  ? <div style={{ display: 'flex', gap: 7 }}><MapPin size={15} style={{ color: 'var(--accent)', flex: '0 0 auto', marginTop: 1 }} /><div><div style={{ fontWeight: 700 }}>{card.currentJob.customer} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>· {String(card.currentJob.status).replace(/_/g, ' ')}</span></div>{card.currentJob.where && <div className="muted" style={{ fontSize: 12 }}>{card.currentJob.where}</div>}</div></div>
                  : <div className="muted" style={{ display: 'flex', gap: 7 }}><MapPin size={15} style={{ flex: '0 0 auto' }} /> {card.jobsToday ? `${card.jobsToday} job${card.jobsToday === 1 ? '' : 's'} today` : 'No jobs today'}{card.lastSeenMin != null ? ` · GPS ${card.lastSeenMin}m ago` : ''}</div>}
                {card.truck && <div style={{ display: 'flex', gap: 7 }}><span style={{ width: 15, textAlign: 'center' }}>🚚</span> Truck {card.truck}</div>}
                {card.toolsOut && card.toolsOut.length > 0 && <div style={{ display: 'flex', gap: 7 }}><Wrench size={15} style={{ color: 'var(--fg-3)', flex: '0 0 auto', marginTop: 1 }} /><div><span style={{ fontWeight: 700 }}>{card.toolsOut.length} tool{card.toolsOut.length === 1 ? '' : 's'} out</span><div className="muted" style={{ fontSize: 12 }}>{card.toolsOut.slice(0, 5).join(', ')}{card.toolsOut.length > 5 ? '…' : ''}</div></div></div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  {card.phone && <a href={`tel:${String(card.phone).replace(/[^\d+]/g, '')}`} className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '6px 11px' }}><Phone size={14} /> Call</a>}
                  {card.phone && <a href={`sms:${String(card.phone).replace(/[^\d+]/g, '')}`} className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '6px 11px' }}><MessageSquare size={14} /> Text</a>}
                  <button onClick={() => mention(card.name)} className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '6px 11px' }}><MessageSquarePlus size={14} /> #sheetz</button>
                </div>
                {!card.phone && <span className="muted" style={{ fontSize: 11.5 }}>No phone on file — add it on Team.</span>}
              </>}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

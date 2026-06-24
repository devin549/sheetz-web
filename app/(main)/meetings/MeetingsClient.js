'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createMeeting, acknowledgeMeeting, deleteMeeting, nudgePending } from './actions';
import { googleCalendarLink } from '@/lib/calendar';
import { ThumbsUp, CalendarPlus, Check, Send, Trash2, Users, MapPin, Clock, ChevronDown, Bell } from 'lucide-react';

const input = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 10px', fontSize: 14, fontFamily: 'inherit' };
const lbl = { fontSize: 10.5, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 3 };
const whenStr = (iso) => { try { return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

function MeetingCard({ m, canCreate, myName, onAck, onDel, onNudge, nudged, busy }) {
  const [showWho, setShowWho] = useState(false);
  const cal = googleCalendarLink({ title: m.title, startISO: m.starts_at, durationMin: m.duration_min, location: m.location || '', details: m.notes || '' });
  const past = new Date(m.starts_at).getTime() < Date.now();
  const ackedCount = m.acked.length;
  return (
    <div className="card" style={{ borderLeft: '3px solid var(--accent)', opacity: past ? 0.7 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{m.title}</div>
          <div className="muted" style={{ fontSize: 12.5, display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 3 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {whenStr(m.starts_at)}</span>
            {m.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {m.location}</span>}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Users size={12} /> {m.audience === 'everyone' ? 'Everyone' : `${m.audience} crew`}</span>
          </div>
        </div>
        {canCreate && <button onClick={() => onDel(m.id)} disabled={busy} title="Remove meeting" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: 2 }}><Trash2 size={15} /></button>}
      </div>
      {m.notes && <div style={{ fontSize: 13, marginTop: 7, lineHeight: 1.45 }}>{m.notes}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        {m.iAcked ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, color: 'var(--green)' }}><Check size={15} /> You acknowledged</span>
        ) : m.iAmRequired ? (
          <button onClick={() => onAck(m.id, cal)} disabled={busy} className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: busy ? 0.6 : 1 }}><ThumbsUp size={15} /> Acknowledge &amp; add to calendar</button>
        ) : null}
        {(m.iAcked || !m.iAmRequired) && cal && <a href={cal} target="_blank" rel="noreferrer" className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)' }}><CalendarPlus size={13} /> Add to calendar</a>}
      </div>

      <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
          <span style={{ fontWeight: 700, color: m.pending.length ? 'var(--amber)' : 'var(--green)' }}>{ackedCount} of {m.requiredCount} acknowledged</span>
          {canCreate && m.pending.length > 0 && <button onClick={() => setShowWho((s) => !s)} className="pill" style={{ cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}><ChevronDown size={11} /> {m.pending.length} pending</button>}
          {canCreate && m.pending.length > 0 && <button onClick={() => onNudge(m.id)} disabled={busy} className="pill" style={{ cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--accent)' }}><Bell size={11} /> {nudged ? 'Nudged' : 'Nudge pending'}</button>}
        </div>
        {canCreate && showWho && (
          <div style={{ marginTop: 6, fontSize: 12 }}>
            <div className="muted" style={{ marginBottom: 2 }}>Still need to acknowledge:</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{m.pending.map((n) => <span key={n} className="pill" style={{ fontSize: 11, color: 'var(--amber)' }}>{n}</span>)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MeetingsClient({ meetings, crewNames, canCreate, myName, myCrew }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [nudged, setNudged] = useState({});

  function onNudge(id) { if (busy) return; setBusy(true); start(async () => { const r = await nudgePending(id); setBusy(false); setMsg(r); if (r.ok) setNudged((n) => ({ ...n, [id]: true })); }); }

  function submit(e) {
    e.preventDefault(); const form = e.currentTarget;
    setMsg(null);
    start(async () => { const r = await createMeeting(new FormData(form)); setMsg(r); if (r.ok) { form.reset(); setOpen(false); router.refresh(); } });
  }
  function onAck(id, cal) { if (busy) return; setBusy(true); start(async () => { const r = await acknowledgeMeeting(id); setBusy(false); if (r.ok) { if (cal && typeof window !== 'undefined') window.open(cal, '_blank', 'noopener'); router.refresh(); } else setMsg(r); }); }
  function onDel(id) { if (busy) return; setBusy(true); start(async () => { const r = await deleteMeeting(id); setBusy(false); router.refresh(); if (!r.ok) setMsg(r); }); }

  return (
    <>
      {canCreate && (
        <div style={{ margin: '4px 0 14px' }}>
          <button onClick={() => setOpen((o) => !o)} className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Send size={15} /> {open ? 'Close' : 'Send a meeting'}</button>
          {msg && <span style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)', marginLeft: 12 }}>{msg.msg}</span>}
        </div>
      )}
      {canCreate && open && (
        <form onSubmit={submit} className="card card-amber" style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
          <div><span style={lbl}>Title *</span><input name="title" placeholder="e.g. Rheem training" style={input} required autoComplete="off" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 10 }}>
            <div><span style={lbl}>Date *</span><input name="date" type="date" style={input} required /></div>
            <div><span style={lbl}>Time *</span><input name="time" type="time" style={input} required /></div>
            <div><span style={lbl}>Minutes</span><input name="duration" type="number" min="15" step="15" defaultValue={60} style={input} /></div>
            <div><span style={lbl}>Audience</span>
              <select name="audience" defaultValue={myCrew || 'everyone'} style={input}>
                <option value="everyone">Everyone</option>
                {crewNames.map((c) => <option key={c} value={c}>{c} crew</option>)}
              </select>
            </div>
          </div>
          <div><span style={lbl}>Location</span><input name="location" placeholder="Shop / address / Zoom link" style={input} autoComplete="off" /></div>
          <div><span style={lbl}>Notes</span><textarea name="notes" rows={2} placeholder="What it's about, what to bring…" style={{ ...input, resize: 'vertical' }} /></div>
          <div><button type="submit" className="btn" disabled={pending}>{pending ? 'Sending…' : 'Send meeting → crew must acknowledge'}</button></div>
        </form>
      )}

      {!meetings.length && <div className="card"><span className="muted">No meetings scheduled.{canCreate ? ' Send one above.' : ''}</span></div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {meetings.map((m) => <MeetingCard key={m.id} m={m} canCreate={canCreate} myName={myName} onAck={onAck} onDel={onDel} onNudge={onNudge} nudged={nudged[m.id]} busy={busy || pending} />)}
      </div>
    </>
  );
}

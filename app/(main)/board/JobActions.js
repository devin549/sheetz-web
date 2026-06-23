'use client';

import { useState, useTransition } from 'react';
import { cancelJob, setDuration } from './actions';
import { CANCEL_REASONS, DURATION_PRESETS } from './boardTokens';

// ─── Right-click context menu (exact item set from dispatchboard_panel.html) ───
const MUTATE = ['duration', 'enroute', 'onsite', 'done', 'reassign', 'unassign', 'cancel'];
const MENU = [
  { id: 'open', label: 'Open details', icon: '📋' },
  { id: 'duration', label: 'Set duration…', icon: '⏱' },
  { id: 'enroute', label: 'Mark en route', icon: '🚚' },
  { id: 'onsite', label: 'Mark on site', icon: '📍' },
  { id: 'done', label: 'Mark complete', icon: '✓' },
  { id: '__sep' },
  { id: 'call', label: 'Call customer', icon: '📞' },
  { id: 'reassign', label: 'Reassign tech…', icon: '👥' },
  { id: '__sep' },
  { id: 'unassign', label: 'Send to queue', icon: '♻', danger: true },
  { id: 'cancel', label: 'Cancel job…', icon: '✕', danger: true },
];

export function ContextMenu({ menu, onClose, onAction, canMutate = true }) {
  if (!menu) return null;
  let items = MENU;
  if (!canMutate) items = MENU.filter((it) => (it.id === '__sep' ? false : MUTATE.indexOf(it.id) < 0));
  return (
    <>
      <div onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
      <div style={{ position: 'fixed', left: Math.min(menu.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 220), top: menu.y, zIndex: 1001, minWidth: 200, padding: 4, background: 'var(--surface-1)', border: '1px solid var(--border-strong)', borderRadius: 7, boxShadow: '0 10px 30px rgba(0,0,0,0.25)', fontSize: 12 }}>
        {items.map((it, i) => it.id === '__sep' ? (
          <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
        ) : (
          <button key={it.id} onClick={() => onAction(it.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', background: 'transparent', border: 0, borderRadius: 4, color: it.danger ? 'var(--red)' : 'var(--fg-1)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            <span style={{ width: 14, textAlign: 'center' }}>{it.icon}</span>{it.label}
          </button>
        ))}
      </div>
    </>
  );
}

const overlay = { position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.55)' };
const modal = { position: 'fixed', zIndex: 2001, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', maxWidth: '92vw', background: 'var(--surface-1)', border: '1px solid var(--border-strong)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', padding: '18px 20px' };
const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 5px' };
const fld = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', color: 'var(--fg-1)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '9px 11px', fontSize: 13, fontFamily: 'inherit' };

// ─── Cancel-with-reason modal (exact from dispatchboard_app.html CancelJobModal) ───
export function CancelModal({ job, onClose, onDone }) {
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, start] = useTransition();
  const sel = CANCEL_REASONS.find((r) => r.code === code);
  const needsNote = !!(sel && sel.needsNote);
  const confirm = () => {
    setErr('');
    if (!code) { setErr('Pick a reason.'); return; }
    if (needsNote && note.trim().length < 3) { setErr('Add a quick note explaining why (required for this reason).'); return; }
    start(async () => { const res = await cancelJob(job.id, code, note); if (res && !res.ok) setErr(res.msg); else onDone(); });
  };
  return (
    <>
      <div onClick={onClose} style={overlay} />
      <div style={{ ...modal, width: 420 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--fg-1)', marginBottom: 2 }}>Cancel this job?</div>
        <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 14 }}>
          {job.customer || 'Customer'}{job.address ? ' · ' + String(job.address).split(',')[0] : ''}{job.job_number ? ' · ' + job.job_number : ''}
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={lbl}>Why is it canceling? *</div>
          <select style={fld} value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="">— pick a reason —</option>
            {CANCEL_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 6 }}>
          <div style={lbl}>Note {needsNote ? '*' : '(optional)'}</div>
          <textarea style={{ ...fld, minHeight: 64, resize: 'vertical' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder={needsNote ? 'Required — what happened?' : 'Anything useful for the record…'} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 12 }}>🧠 The reason feeds the cancellation watcher — the AI trends causes + lost revenue so we can win this work back.</div>
        {err && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--fg-1)', fontSize: 13, cursor: 'pointer' }}>Keep job</button>
          <button onClick={confirm} disabled={busy} style={{ padding: '8px 16px', borderRadius: 7, border: 0, background: 'var(--red)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Cancelling…' : 'Cancel job'}</button>
        </div>
      </div>
    </>
  );
}

// ─── Set-duration modal (exact from dispatchboard_app.html SetDurationModal) ───
export function DurationModal({ job, onClose, onDone }) {
  const cur = job.duration_min || 60;
  const [mins, setMins] = useState(cur);
  const [err, setErr] = useState('');
  const [busy, start] = useTransition();
  const hrs = (m) => (m % 60 === 0 ? m / 60 + 'h' : m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm');
  const save = () => {
    setErr('');
    const d = Math.max(15, Math.min(720, Math.round(Number(mins) || 0)));
    if (!d) { setErr('Enter minutes.'); return; }
    start(async () => { const res = await setDuration(job.id, d); if (res && !res.ok) setErr(res.msg); else onDone(); });
  };
  return (
    <>
      <div onClick={onClose} style={overlay} />
      <div style={{ ...modal, width: 380 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--fg-1)', marginBottom: 2 }}>How long will this take?</div>
        <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 14 }}>{job.customer || 'Job'}{job.job_type ? ' · ' + job.job_type : ''} · now set to <strong style={{ color: 'var(--fg-2)' }}>{hrs(cur)}</strong></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
          {DURATION_PRESETS.map((p) => (
            <button key={p.min} onClick={() => setMins(p.min)} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: '1px solid ' + (Number(mins) === p.min ? 'var(--accent)' : 'var(--border-strong)'), background: Number(mins) === p.min ? 'var(--accent)' : 'transparent', color: Number(mins) === p.min ? '#fff' : 'var(--fg-1)' }}>{p.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>Custom:</span>
          <input type="number" min="15" max="720" step="15" value={mins} onChange={(e) => setMins(e.target.value)} style={{ width: 90, background: 'var(--surface-2)', color: 'var(--fg-1)', border: '1px solid var(--border-strong)', borderRadius: 7, padding: '7px 9px', fontSize: 13 }} />
          <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>minutes</span>
        </div>
        {err && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--fg-1)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={busy} style={{ padding: '8px 16px', borderRadius: 7, border: 0, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save duration'}</button>
        </div>
      </div>
    </>
  );
}

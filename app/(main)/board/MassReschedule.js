'use client';

// 🌧 Mass reschedule — bad weather / truck down: move EVERY open job on the board's day to another day
// (same clock times) and email each affected customer the new time + the reason. Assign-gated; the
// server action enforces the reason + a 60-job cap. Customers with no email get counted so the office
// knows who to CALL (we never auto-text — A2P pending).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { massReschedule } from './actions';

export default function MassReschedule({ dateStr }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();

  const go = () => {
    setMsg(null);
    start(async () => {
      const r = await massReschedule(dateStr, to, reason.trim());
      setMsg(r);
      if (r?.ok) { setReason(''); router.refresh(); }
    });
  };

  return (
    <>
      <button onClick={() => { setOpen(true); setMsg(null); }} className="pill" title="Bad weather? Move every open job on this day — customers get emailed the new time" style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--fg-2)', border: '1px solid var(--border-strong)' }}>🌧 Move the day</button>
      {open && (
        <div onClick={() => !pending && setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 430, borderLeft: '3px solid var(--amber)' }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>🌧 Move {dateStr}&apos;s jobs to another day</div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Every open job keeps its clock time on the new day. Each customer gets an <strong>email</strong> with the new time + your reason (no email on file → we tell you who to call).</div>
            <label style={{ fontSize: 11, color: 'var(--fg-2)', display: 'block', marginBottom: 8 }}>Move everything to
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ display: 'block', marginTop: 4, width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--fg-2)', display: 'block', marginBottom: 10 }}>Reason (the customers read this)
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. ice storm — roads aren’t safe for our trucks" style={{ display: 'block', marginTop: 4, width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 13 }} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={go} disabled={pending || !to || !reason.trim()} className="btn" style={{ flex: 1, opacity: (pending || !to || !reason.trim()) ? 0.55 : 1 }}>{pending ? 'Moving + emailing…' : '🌧 Move the day + email customers'}</button>
              <button onClick={() => setOpen(false)} disabled={pending} className="btn btn-ghost">Close</button>
            </div>
            {msg && <div style={{ fontSize: 12.5, marginTop: 10, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
          </div>
        </div>
      )}
    </>
  );
}

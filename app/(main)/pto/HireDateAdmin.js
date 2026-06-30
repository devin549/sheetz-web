'use client';

// Office-only: set each crew member's hire date — the anchor for the vacation anniversary grant + the 90-day
// holiday eligibility. Until a date is set, that person's vacation balance shows "—". One row per employee.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setHireDate } from './actions';

function Row({ p }) {
  const router = useRouter();
  const [date, setDate] = useState(p.hireDate || '');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const dirty = (date || '') !== (p.hireDate || '');
  const save = () => { setMsg(null); start(async () => { const r = await setHireDate(p.techId, date); setMsg(r); if (r.ok) router.refresh(); }); };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 130, fontSize: 13 }}>
        <strong style={{ color: 'var(--fg-1)' }}>{p.name}</strong>
        <span className="muted" style={{ fontSize: 11 }}> · {p.role}{!p.hireDate ? ' · ⚠ no date' : ''}</span>
      </div>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '6px 9px', fontSize: 13 }} />
      <button onClick={save} disabled={pending || !dirty} className="btn" style={{ padding: '6px 12px', fontSize: 12, opacity: (pending || !dirty) ? 0.5 : 1 }}>{pending ? '…' : 'Save'}</button>
      {msg && <span style={{ fontSize: 11, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.ok ? '✓' : msg.msg}</span>}
    </div>
  );
}

export default function HireDateAdmin({ roster = [] }) {
  const missing = roster.filter((p) => !p.hireDate).length;
  if (!roster.length) return null;
  return (
    <div className="card" style={{ marginTop: 14, borderLeft: '3px solid var(--purple)' }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 2 }}>🗓 Hire dates {missing > 0 && <span style={{ color: 'var(--amber)', fontSize: 11 }}>· {missing} missing</span>}</div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Sets each person's vacation anniversary (5 days earned at 1 yr, use-it-or-lose-it) and 90-day holiday eligibility. No date = balance shows “—”.</div>
      {roster.map((p) => <Row key={p.techId} p={p} />)}
    </div>
  );
}

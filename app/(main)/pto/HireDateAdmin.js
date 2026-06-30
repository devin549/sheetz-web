'use client';

// Office-only: set each crew member's hire date + vacation allotment. Hire date anchors the anniversary grant
// and 90-day holiday eligibility; vacation days = how many they earn each year (5 = 1 wk, 10 = 2 wks). Paid
// holidays stay a fixed 5 for everyone. Until a hire date is set, that person's vacation balance shows "—".
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveEmployeePto } from './actions';

function Row({ p }) {
  const router = useRouter();
  const [date, setDate] = useState(p.hireDate || '');
  const [days, setDays] = useState(p.vacationDays == null ? 5 : p.vacationDays);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const dirty = (date || '') !== (p.hireDate || '') || Number(days) !== Number(p.vacationDays == null ? 5 : p.vacationDays);
  const save = () => { setMsg(null); start(async () => { const r = await saveEmployeePto(p.techId, date, days); setMsg(r); if (r.ok) router.refresh(); }); };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 120, fontSize: 13 }}>
        <strong style={{ color: 'var(--fg-1)' }}>{p.name}</strong>
        <span className="muted" style={{ fontSize: 11 }}> · {p.role}{!p.hireDate ? ' · ⚠ no date' : ''}</span>
      </div>
      <label className="muted" style={{ fontSize: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>Hired
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '6px 9px', fontSize: 13 }} />
      </label>
      <label className="muted" style={{ fontSize: 10, display: 'flex', flexDirection: 'column', gap: 2 }}>Vac days
        <input type="number" min="0" max="60" step="5" value={days} onChange={(e) => setDays(e.target.value)} style={{ width: 64, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '6px 9px', fontSize: 13 }} />
      </label>
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
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 2 }}>🗓 Hire dates &amp; vacation {missing > 0 && <span style={{ color: 'var(--amber)', fontSize: 11 }}>· {missing} missing a date</span>}</div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Hire date sets the vacation anniversary + 90-day holiday eligibility. Vacation days = what they earn each year (5 = 1 wk, 10 = 2 wks) — use-it-or-lose-it. Paid holidays are a fixed 5/yr for everyone. No hire date = balance shows “—”.</div>
      {roster.map((p) => <Row key={p.techId} p={p} />)}
    </div>
  );
}

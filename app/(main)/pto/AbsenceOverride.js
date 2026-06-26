'use client';

// Manager override of a policy-decided absence. Requires a reason; flips excused/unexcused and logs it as
// an override (against-policy is flagged in the audit trail) — so favoritism is visible, not silent.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { overrideAbsence } from './actions';

const COLOR = { excused: 'var(--green)', unexcused: 'var(--red)', pending: 'var(--amber)' };

export default function AbsenceOverride({ items = [] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState(null);

  const flip = (id, to) => {
    if (!reason.trim()) { setMsg('A reason is required for an override.'); return; }
    setMsg(null);
    start(async () => { const r = await overrideAbsence(id, to, reason); if (r.ok) { setOpenId(null); setReason(''); router.refresh(); } else setMsg(r.msg); });
  };

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {items.map((a) => (
        <div key={a.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{a.label}</span>
            <span className="pill" style={{ fontSize: 10, color: COLOR[a.status], border: `1px solid ${COLOR[a.status]}` }}>{a.status.toUpperCase()}</span>
            <button onClick={() => { setOpenId(openId === a.id ? null : a.id); setReason(''); setMsg(null); }} className="pill" style={{ cursor: 'pointer', color: 'var(--blue)' }}>override</button>
          </div>
          {openId === a.id && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required — logged)" style={{ flex: '1 1 160px', background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '7px 9px', fontSize: 12.5 }} />
              <button onClick={() => flip(a.id, 'excused')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--green)', border: '1px solid var(--green)' }}>→ excused</button>
              <button onClick={() => flip(a.id, 'unexcused')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--red)', border: '1px solid var(--red)' }}>→ unexcused</button>
            </div>
          )}
        </div>
      ))}
      {msg && <div style={{ color: 'var(--red)', fontSize: 12 }}>{msg}</div>}
    </div>
  );
}

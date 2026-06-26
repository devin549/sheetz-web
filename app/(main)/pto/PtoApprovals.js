'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { decideTimeOff } from './actions';

export default function PtoApprovals({ items = [] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const decide = (id, approve) => { setBusy(id + (approve ? 'a' : 'd')); start(async () => { const r = await decideTimeOff(id, approve, ''); setBusy(null); if (r.ok) router.refresh(); else setMsg(r.msg); }); };

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {items.map((r) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{r.label}</span>
          <button onClick={() => decide(r.id, true)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--green)', border: '1px solid var(--green)' }}>{busy === r.id + 'a' ? '…' : '✓ Approve'}</button>
          <button onClick={() => decide(r.id, false)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--red)', border: '1px solid var(--red)' }}>{busy === r.id + 'd' ? '…' : '✕ Deny'}</button>
        </div>
      ))}
      {msg && <div style={{ color: 'var(--red)', fontSize: 12 }}>{msg}</div>}
    </div>
  );
}

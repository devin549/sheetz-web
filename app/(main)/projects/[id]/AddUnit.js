'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addUnit } from '../actions';

export default function AddUnit({ projectId, nextSort = 0 }) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);

  const add = () => {
    if (!label.trim()) return;
    setErr(null);
    start(async () => { const r = await addUnit(projectId, label, nextSort); if (r.ok) { setLabel(''); router.refresh(); } else setErr(r.msg); });
  };

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
      <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="Add a unit — e.g. Apt 101"
        style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 12px', fontSize: 14 }} />
      <button onClick={add} disabled={pending} className="btn" style={{ whiteSpace: 'nowrap', opacity: pending ? 0.6 : 1 }}>{pending ? '…' : '＋ Unit'}</button>
      {err && <span style={{ color: 'var(--red)', fontSize: 12 }}>{err}</span>}
    </div>
  );
}

'use client';

// DispatchMe job id — stored on the Sheetz job for REFERENCE only. Sheetz/Supabase is the source of
// truth for photos; we do NOT sync photos back to DispatchMe (no API). Office can set/clear it.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setDispatchmeId } from './actions';

export default function DispatchMeRef({ jobId, value, canEdit }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || '');
  const [pending, start] = useTransition();
  const save = () => start(async () => { const r = await setDispatchmeId(jobId, val); if (r?.ok) { setEditing(false); router.refresh(); } });

  if (!canEdit) return value ? <span className="pill" style={{ fontSize: 11 }}>DispatchMe #{value}</span> : null;
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="pill" style={{ cursor: 'pointer', fontSize: 11, border: '1px dashed var(--border-strong)' }}>
        {value ? `DispatchMe #${value} ✎` : '+ Link DispatchMe id'}
      </button>
    );
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="DispatchMe job id" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '5px 8px', fontSize: 12, width: 150 }} />
      <button onClick={save} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--green)' }}>{pending ? '…' : 'Save'}</button>
      <button onClick={() => { setEditing(false); setVal(value || ''); }} className="pill" style={{ cursor: 'pointer' }}>✕</button>
    </span>
  );
}

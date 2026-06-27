'use client';

// ➖ Use this van part on the active job — decrements van stock + logs it to the job (moment-of-use).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFromVan } from './truckActions';

export default function UsePartBtn({ partId, jobId, jobNumber }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState(false);
  const use = () => start(async () => { const r = await useFromVan(partId, jobId); if (r?.ok) { setFlash(true); router.refresh(); setTimeout(() => setFlash(false), 1200); } });
  return (
    <button onClick={use} disabled={pending} title={`Use 1 on job #${jobNumber || ''}`}
      style={{ background: 'transparent', border: '1px solid var(--amber-dim)', color: flash ? 'var(--green-bright)' : 'var(--amber)', borderRadius: 6, padding: '3px 8px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', opacity: pending ? 0.5 : 1, whiteSpace: 'nowrap' }}>
      {flash ? '✓' : pending ? '…' : '➖ Use'}
    </button>
  );
}

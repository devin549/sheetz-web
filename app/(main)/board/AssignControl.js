'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assignTech } from './actions';

export default function AssignControl({ jobId, techs, currentId, accent }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);

  function onChange(e) {
    const techId = e.target.value || null;
    setErr(null);
    start(async () => {
      const res = await assignTech(jobId, techId);
      if (res && !res.ok) setErr(res.msg);
      else router.refresh();
    });
  }

  return (
    <div style={{ marginTop: 6 }}>
      <select
        defaultValue={currentId || ''}
        onChange={onChange}
        disabled={pending}
        aria-label="Assign tech"
        style={{
          width: '100%', background: 'var(--surface-2)', border: `1px solid ${currentId ? 'var(--border)' : accent || 'var(--border)'}`,
          color: 'var(--fg-1)', borderRadius: 6, padding: '5px 7px', fontSize: 11, cursor: 'pointer',
          opacity: pending ? 0.6 : 1,
        }}
      >
        <option value="">{pending ? 'saving…' : '— assign tech —'}</option>
        {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {err && <div style={{ color: 'var(--red)', fontSize: 10, marginTop: 3 }}>{err}</div>}
    </div>
  );
}

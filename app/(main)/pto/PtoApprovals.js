'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { decideTimeOff } from './actions';
import { SHORT_NOTICE_DAYS } from '@/lib/techAvailability';

export default function PtoApprovals({ items = [] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const decide = (item, approve) => {
    // Approving over a conflict → make the manager look before they leap. Lists who's already off then.
    if (approve && item.conflicts && item.conflicts.length) {
      const lines = item.conflicts.map((c) => `• ${c.name} (${c.start}${c.end ? `–${c.end}` : ''})`).join('\n');
      const n = item.conflicts.length;
      if (!window.confirm(`Are you sure you want to approve?\n\nYou already have ${n} employee${n > 1 ? 's' : ''} off during this time:\n${lines}\n\nApprove anyway?`)) return;
    }
    setBusy(item.id + (approve ? 'a' : 'd'));
    start(async () => { const r = await decideTimeOff(item.id, approve, ''); setBusy(null); if (r.ok) router.refresh(); else setMsg(r.msg); });
  };

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {items.map((item) => {
        const shortNotice = item.notice != null && item.notice >= 0 && item.notice < SHORT_NOTICE_DAYS;
        const hasConflict = item.conflicts && item.conflicts.length > 0;
        return (
          <div key={item.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid ' + (hasConflict ? 'var(--amber-dim)' : 'var(--border)') }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{item.label}</span>
              {shortNotice && <span className="pill" style={{ fontSize: 9.5, color: 'var(--amber)', border: '1px solid var(--amber-dim)' }} title={`${item.notice} day${item.notice === 1 ? '' : 's'} out — CB prefers 2 weeks`}>⚠ {item.notice}d notice</span>}
              {hasConflict && <span className="pill" style={{ fontSize: 9.5, color: 'var(--red)', border: '1px solid var(--red)' }}>⚠ {item.conflicts.length} off then</span>}
              <button onClick={() => decide(item, true)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--green)', border: '1px solid var(--green)' }}>{busy === item.id + 'a' ? '…' : '✓ Approve'}</button>
              <button onClick={() => decide(item, false)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--red)', border: '1px solid var(--red)' }}>{busy === item.id + 'd' ? '…' : '✕ Deny'}</button>
            </div>
            {hasConflict && (
              <div className="muted" style={{ fontSize: 10.5, marginTop: 5, color: 'var(--amber)' }}>
                Also off then: {item.conflicts.map((c) => `${c.name} (${c.start}${c.end ? `–${c.end}` : ''})`).join(' · ')}
              </div>
            )}
          </div>
        );
      })}
      {msg && <div style={{ color: 'var(--red)', fontSize: 12 }}>{msg}</div>}
    </div>
  );
}

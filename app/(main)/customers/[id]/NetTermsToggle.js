'use client';

// 🗓 Payment terms — set a trusted/commercial customer to Net-30 (or Net-15). Owner / GM / accounting only.
// When set, the close doesn't collect; the office invoices and AR tracks it due in N days.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setPaymentTerms } from '../actions';

export default function NetTermsToggle({ customerId, days = 0, by = null, canEdit = false }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const set = (n) => start(async () => { setMsg(null); const r = await setPaymentTerms(customerId, n); setMsg(r); if (r.ok) router.refresh(); });

  if (!canEdit && !days) return null;
  return (
    <div className="card" style={{ marginTop: 10, borderLeft: `3px solid ${days ? 'var(--amber)' : 'var(--border)'}` }}>
      <div style={{ fontWeight: 800, fontSize: 13 }}>🗓 Payment terms{days ? ` · NET-${days}` : ' · due at close'}</div>
      {days ? <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>The close won&apos;t collect — the office invoices, due in {days} days.{by ? ` · set by ${by}` : ''}</div>
            : <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>Collected at close. Set Net terms for trusted / commercial accounts only.</div>}
      {canEdit && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {[['Due at close', 0], ['Net-15', 15], ['Net-30', 30]].map(([label, n]) => (
            <button key={n} onClick={() => set(n)} disabled={pending} className="pill" style={{ cursor: 'pointer', fontWeight: days === n ? 800 : 600, background: days === n ? 'var(--amber)' : 'var(--surface-2)', color: days === n ? '#1a1206' : 'var(--fg-2)', border: '1px solid var(--border)' }}>{label}</button>
          ))}
        </div>
      )}
      {msg && <div style={{ fontSize: 11.5, marginTop: 6, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </div>
  );
}

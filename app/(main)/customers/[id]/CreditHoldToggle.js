'use client';

// Place / lift a credit hold from the customer profile. Owner / GM / accounting only (the page gates
// `canEdit`). A hold blocks new bookings for everyone below that tier.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setCreditHold } from '../actions';

export default function CreditHoldToggle({ customerId, held, reason, by, canEdit }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState('');
  const [msg, setMsg] = useState(null);

  const apply = (on) => start(async () => {
    setMsg(null);
    const r = await setCreditHold(customerId, on, why);
    setMsg(r);
    if (r.ok) { setOpen(false); setWhy(''); router.refresh(); }
  });

  if (held) {
    return (
      <div className="card" style={{ marginTop: 10, borderLeft: '3px solid var(--red)', background: 'rgba(239,83,80,.08)' }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--red)' }}>🚦 ON CREDIT HOLD</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{reason || 'Past-due balance.'}{by ? ` · set by ${by}` : ''}</div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>New bookings require owner / GM / accounting approval.</div>
        {canEdit && (
          <button onClick={() => apply(false)} disabled={pending} style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontWeight: 700, fontSize: 12, cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1 }}>Lift hold</button>
        )}
        {msg && <div style={{ fontSize: 11.5, marginTop: 6, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
      </div>
    );
  }

  if (!canEdit) return null;
  return (
    <div style={{ marginTop: 10 }}>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>🚦 Place credit hold</button>
      ) : (
        <div className="card" style={{ border: '1px solid var(--red)' }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Place credit hold</div>
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Reason — e.g. $690k past due, terms unsigned"
            style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontSize: 13 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => apply(true)} disabled={pending} style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 800, fontSize: 12, cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1 }}>Place hold</button>
            <button onClick={() => { setOpen(false); setMsg(null); }} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-3)', cursor: 'pointer' }}>Cancel</button>
          </div>
          {msg && <div style={{ fontSize: 11.5, marginTop: 6, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
        </div>
      )}
    </div>
  );
}

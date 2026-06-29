'use client';

// 🏛 Billing mode — who collects: the TECH at the close (residential default) or the OFFICE by invoice
// (commercial / property managers / recurring accounts). When "Bill from office" is on, the close-out
// collects nothing and is satisfied by a "billed_office" disposition; the office invoices, due per the
// terms (on receipt / Net-15 / Net-30). Owner / GM / accounting only — it's a credit decision.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setBilling } from '../actions';

export default function NetTermsToggle({ customerId, days = 0, officeBills = false, by = null, canEdit = false }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const office = officeBills || days > 0; // back-compat: a net-terms customer is office-billed
  const apply = (officeBills, d) => start(async () => { setMsg(null); const r = await setBilling(customerId, { officeBills, days: d }); setMsg(r); if (r.ok) router.refresh(); });

  if (!canEdit && !office) return null;
  const termLabel = days ? `Net-${days}` : 'due on receipt';
  return (
    <div className="card" style={{ marginTop: 10, borderLeft: `3px solid ${office ? 'var(--amber)' : 'var(--border)'}` }}>
      <div style={{ fontWeight: 800, fontSize: 13 }}>🏛 Billing · {office ? `Bill from office (${termLabel})` : 'Tech collects at close'}</div>
      {office
        ? <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>Techs collect nothing on site — the office invoices this account{days ? `, due in ${days} days` : ' (due on receipt)'}.{by ? ` · set by ${by}` : ''}</div>
        : <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>Collected at the close. Switch to office billing for trusted / commercial accounts only.</div>}
      {canEdit && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <button onClick={() => apply(false, 0)} disabled={pending} className="pill" style={{ cursor: 'pointer', fontWeight: !office ? 800 : 600, background: !office ? 'var(--amber)' : 'var(--surface-2)', color: !office ? '#1a1206' : 'var(--fg-2)', border: '1px solid var(--border)' }}>Tech collects at close</button>
            <button onClick={() => apply(true, days || 30)} disabled={pending} className="pill" style={{ cursor: 'pointer', fontWeight: office ? 800 : 600, background: office ? 'var(--amber)' : 'var(--surface-2)', color: office ? '#1a1206' : 'var(--fg-2)', border: '1px solid var(--border)' }}>🏛 Bill from office</button>
          </div>
          {office && (
            <div style={{ marginTop: 8 }}>
              <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Office invoice due</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[['On receipt', 0], ['Net-15', 15], ['Net-30', 30]].map(([label, n]) => (
                  <button key={n} onClick={() => apply(true, n)} disabled={pending} className="pill" style={{ cursor: 'pointer', fontWeight: days === n ? 800 : 600, background: days === n ? 'var(--surface-3)' : 'var(--surface-2)', color: 'var(--fg-1)', border: `1px solid ${days === n ? 'var(--amber-dim)' : 'var(--border)'}` }}>{label}</button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {msg && <div style={{ fontSize: 11.5, marginTop: 6, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </div>
  );
}

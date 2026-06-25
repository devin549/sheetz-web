'use client';

// Collect payment for THIS job — fires a Stripe pay-link (customer pays + card fee on a secure page).
import { useState, useTransition } from 'react';
import { createJobPayLink } from '../../../my-day/actions';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function CollectPay({ jobId, defaultAmount, tel }) {
  const [amt, setAmt] = useState(defaultAmount ? String(defaultAmount) : '');
  const [link, setLink] = useState(null);
  const [err, setErr] = useState(null);
  const [pending, start] = useTransition();
  const make = () => { setErr(null); start(async () => { const r = await createJobPayLink(jobId, Number(amt)); if (r.ok) setLink(r); else setErr(r.msg); }); };

  return (
    <div className="card" style={{ borderLeft: '3px solid #635bff', marginTop: 10 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>💳 Collect payment</div>
      {!link ? (
        <>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>$</span>
            <input type="number" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0.00" style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 15 }} />
            <button onClick={make} disabled={pending || !(Number(amt) > 0)} className="btn" style={{ opacity: pending || !(Number(amt) > 0) ? 0.6 : 1 }}>{pending ? '…' : 'Create link'}</button>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Customer pays this + a 4% card fee on a secure Stripe page.</div>
          {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{err}</div>}
        </>
      ) : (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#8a84ff', marginBottom: 6 }}>Ready — customer pays {money(link.totalDollars)} ({money(link.baseDollars)} + {money(link.feeDollars)} fee)</div>
          <input readOnly value={link.url} onFocus={(e) => e.target.select()} style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {tel && <a href={`sms:${tel}?body=${encodeURIComponent('Pay your Clog Busterz invoice here: ' + link.url)}`} className="btn" style={{ flex: 1, textAlign: 'center', minWidth: 120, textDecoration: 'none' }}>✉️ Text customer</a>}
            <a href={link.url} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Open ↗</a>
          </div>
        </>
      )}
    </div>
  );
}

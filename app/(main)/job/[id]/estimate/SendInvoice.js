'use client';

// 📧 The EMAIL section at the bottom of the close flow — send the customer their invoice, or (once paid) their
// PAID invoice. Auto-targets the email on file (from booking); a checkbox reveals a different address.
import { useState, useTransition } from 'react';
import { sendJobInvoiceEmail } from './invoiceActions';

export default function SendInvoice({ jobId, customerEmail = '', paid = false, balance = 0 }) {
  const [pending, start] = useTransition();
  const [sendOther, setSendOther] = useState(false);
  const [extra, setExtra] = useState('');
  const [msg, setMsg] = useState(null);
  const label = paid || balance <= 0 ? 'paid invoice' : 'invoice';
  const send = () => start(async () => { setMsg(null); const r = await sendJobInvoiceEmail(jobId, (sendOther || !customerEmail) ? extra.trim() : ''); setMsg(r); });

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>📧 Email the {label}</div>
      <div className="muted" style={{ fontSize: 11.5 }}>
        {customerEmail
          ? <>Sends to <strong style={{ color: 'var(--fg-1)' }}>{customerEmail}</strong> <span className="muted">(from booking)</span>.</>
          : <span style={{ color: 'var(--amber)' }}>⚠️ No email on file — add one below to send.</span>}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, cursor: 'pointer', fontSize: 12, color: 'var(--fg-2)' }}>
        <input type="checkbox" checked={sendOther} onChange={(e) => setSendOther(e.target.checked)} /> Send to a different email{customerEmail ? ' too' : ''}
      </label>
      {(sendOther || !customerEmail) && <input type="email" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="different@email.com" style={{ width: '100%', boxSizing: 'border-box', marginTop: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 12.5 }} />}
      <button onClick={send} disabled={pending || (!customerEmail && !extra.trim())} className="btn" style={{ marginTop: 8, opacity: (pending || (!customerEmail && !extra.trim())) ? 0.6 : 1 }}>{pending ? 'Sending…' : `📧 Email ${label}`}</button>
      {msg && <div style={{ fontSize: 12, marginTop: 6, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </div>
  );
}

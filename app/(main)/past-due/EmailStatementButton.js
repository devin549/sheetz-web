'use client';

import { useState, useTransition } from 'react';
import { emailStatement } from './actions';

export default function EmailStatementButton({ customerId, hasEmail }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState(null);
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <button
        onClick={() => { if (!hasEmail) { setMsg('No email on file for this customer.'); return; } if (!window.confirm('Email this statement to the customer?')) return; setMsg(null); start(async () => { const r = await emailStatement(customerId); setMsg(r?.msg || (r?.ok ? 'Sent' : 'Error')); }); }}
        disabled={busy}
        title={hasEmail ? 'Email this statement to the customer' : 'No email on file'}
        style={{ background: 'transparent', color: 'var(--info-text)', border: '1px solid var(--info-text)', borderRadius: 9, padding: '9px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: hasEmail ? 1 : 0.55 }}>
        {busy ? 'Emailing…' : '✉️ Email to customer'}
      </button>
      {msg && <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>{msg}</span>}
    </span>
  );
}

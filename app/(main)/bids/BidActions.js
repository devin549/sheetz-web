'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { contactBid } from './actions';

// Text / Call / Email a bid. Logs the contact (the bid stays the tech's — Sales can't take it), THEN opens
// the native messenger / dialer. Hidden once contacted or escalated (handled by the parent).
export default function BidActions({ jobId, phone }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const tel = String(phone || '').replace(/[^0-9+]/g, '');

  const go = (method) => start(async () => {
    const r = await contactBid(jobId, method);
    setMsg(r.msg);
    if (r.ok) {
      if (method === 'text' && tel && typeof window !== 'undefined') window.location.href = `sms:${tel}`;
      else if (method === 'call' && tel && typeof window !== 'undefined') window.location.href = `tel:${tel}`;
      router.refresh();
    }
  });

  const btn = (bg, color, border) => ({ flex: 1, background: bg, color, border: border || 'none', padding: 9, borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: pending ? 'default' : 'pointer' });

  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button onClick={() => go('text')} disabled={pending} style={btn('linear-gradient(135deg,#0d47a1,#1976d2)', '#fff')}>💬 Text</button>
        <button onClick={() => go('call')} disabled={pending} style={btn('linear-gradient(135deg,#2e7d32,#1b5e20)', '#fff')}>📞 Call</button>
        <button onClick={() => go('email')} disabled={pending} style={btn('var(--surface-2)', 'var(--fg-1)', '1px solid var(--border-strong)')}>✉ Email</button>
      </div>
      {msg && <div style={{ fontSize: 11, marginTop: 6, color: 'var(--green)' }}>{msg}</div>}
    </>
  );
}

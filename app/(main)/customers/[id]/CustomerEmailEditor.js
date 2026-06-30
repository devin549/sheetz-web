'use client';

// Set a customer's primary + secondary email. The secondary is CC'd on every customer-facing email so a
// missed/typo'd/spam'd address doesn't mean they never got it. Office-gated server-side.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setCustomerEmails } from '../actions';

const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 };

export default function CustomerEmailEditor({ customerId, email = '', email2 = '', canEdit = false }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [e1, setE1] = useState(email || '');
  const [e2, setE2] = useState(email2 || '');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const save = () => { setMsg(null); start(async () => { const r = await setCustomerEmails(customerId, e1, e2); setMsg(r); if (r.ok) { setOpen(false); router.refresh(); } }); };

  if (!open) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <span style={{ fontSize: 13 }}>{email ? <a href={`mailto:${email}`}>✉️ {email}</a> : <span className="muted">No email on file</span>}</span>
        {email2 && <span className="pill" style={{ fontSize: 11 }}>+ cc {email2}</span>}
        {canEdit && <button onClick={() => setOpen(true)} className="pill" style={{ cursor: 'pointer', fontSize: 11, color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>{email2 ? 'edit emails' : '+ add secondary email'}</button>}
        {msg?.ok && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ saved</span>}
      </div>
    );
  }
  return (
    <div className="card" style={{ marginTop: 8, display: 'grid', gap: 8, borderLeft: '3px solid var(--amber)' }}>
      <div style={{ fontWeight: 800, fontSize: 13 }}>Customer email</div>
      <label style={{ fontSize: 11, color: 'var(--fg-2)' }}>Primary email
        <input type="email" value={e1} onChange={(e) => setE1(e.target.value)} placeholder="name@email.com" style={{ ...inp, marginTop: 3 }} />
      </label>
      <label style={{ fontSize: 11, color: 'var(--fg-2)' }}>Secondary email (CC'd on everything)
        <input type="email" value={e2} onChange={(e) => setE2(e.target.value)} placeholder="spouse / office manager / accountant" style={{ ...inp, marginTop: 3 }} />
      </label>
      <div className="muted" style={{ fontSize: 10.5 }}>Estimates, statements, booking confirmations + reschedules all go to both — so a missed inbox doesn’t mean they never got it.</div>
      {msg && !msg.ok && <div style={{ color: 'var(--red)', fontSize: 12 }}>{msg.msg}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={pending} className="btn" style={{ opacity: pending ? 0.6 : 1 }}>{pending ? 'Saving…' : 'Save'}</button>
        <button onClick={() => setOpen(false)} className="btn btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

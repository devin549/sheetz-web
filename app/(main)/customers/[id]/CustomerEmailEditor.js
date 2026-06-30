'use client';

// Set a customer's primary + secondary email. The secondary is CC'd on every customer-facing email so a
// missed/typo'd/spam'd address doesn't mean they never got it. Office-gated server-side.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setCustomerEmails } from '../actions';

const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 };

// Cheap typo guard — common domain misspellings → the right one. Catches the easy "wrong email" mistakes.
const DOMAIN_FIX = { 'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.co': 'gmail.com', 'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'outlok.com': 'outlook.com', 'icloud.con': 'icloud.com', 'comcast.ent': 'comcast.net', 'comcast.com': 'comcast.net' };
function typoSuggest(addr) {
  const m = String(addr || '').trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+)$/);
  if (!m) return null;
  const fixed = DOMAIN_FIX[m[2]];
  return fixed && fixed !== m[2] ? `${m[1]}@${fixed}` : null;
}

export default function CustomerEmailEditor({ customerId, email = '', email2 = '', emailStatus = null, canEdit = false }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [e1, setE1] = useState(email || '');
  const [e2, setE2] = useState(email2 || '');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const bad = emailStatus === 'bounced' || emailStatus === 'complained';
  const suggest1 = typoSuggest(e1);
  const suggest2 = typoSuggest(e2);
  const save = () => { setMsg(null); start(async () => { const r = await setCustomerEmails(customerId, e1, e2); setMsg(r); if (r.ok) { setOpen(false); router.refresh(); } }); };

  if (!open) {
    return (
      <div style={{ marginTop: 6 }}>
        {bad && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'rgba(239,83,80,.1)', border: '1px solid var(--red)', borderRadius: 8, padding: '7px 10px', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700, flex: 1 }}>⚠ This email {emailStatus === 'complained' ? 'was marked spam' : 'bounced'} — they’re not getting our emails. Fix it.</span>
          {canEdit && <button onClick={() => setOpen(true)} className="pill" style={{ cursor: 'pointer', fontSize: 11, color: 'var(--red)', border: '1px solid var(--red)' }}>Fix email →</button>}
        </div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13 }}>{email ? <a href={`mailto:${email}`} style={bad ? { color: 'var(--red)', textDecoration: 'line-through' } : undefined}>✉️ {email}</a> : <span className="muted">No email on file</span>}</span>
          {email2 && <span className="pill" style={{ fontSize: 11 }}>+ cc {email2}</span>}
          {canEdit && !bad && <button onClick={() => setOpen(true)} className="pill" style={{ cursor: 'pointer', fontSize: 11, color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>{email2 ? 'edit emails' : '+ add secondary email'}</button>}
          {msg?.ok && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ saved</span>}
        </div>
      </div>
    );
  }
  return (
    <div className="card" style={{ marginTop: 8, display: 'grid', gap: 8, borderLeft: '3px solid var(--amber)' }}>
      <div style={{ fontWeight: 800, fontSize: 13 }}>Customer email</div>
      {bad && <div style={{ fontSize: 11, color: 'var(--red)', background: 'rgba(239,83,80,.1)', border: '1px solid var(--red)', borderRadius: 8, padding: '7px 10px' }}>⚠ The current address {emailStatus === 'complained' ? 'marked us as spam' : 'bounced'} — double-check it with the customer before saving.</div>}
      <label style={{ fontSize: 11, color: 'var(--fg-2)' }}>Primary email
        <input type="email" value={e1} onChange={(e) => setE1(e.target.value)} placeholder="name@email.com" style={{ ...inp, marginTop: 3 }} />
        {suggest1 && <button type="button" onClick={() => setE1(suggest1)} style={{ marginTop: 4, background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', fontSize: 11, padding: 0 }}>Did you mean <strong>{suggest1}</strong>? — fix it</button>}
      </label>
      <label style={{ fontSize: 11, color: 'var(--fg-2)' }}>Secondary email (CC'd on everything)
        <input type="email" value={e2} onChange={(e) => setE2(e.target.value)} placeholder="spouse / office manager / accountant" style={{ ...inp, marginTop: 3 }} />
        {suggest2 && <button type="button" onClick={() => setE2(suggest2)} style={{ marginTop: 4, background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', fontSize: 11, padding: 0 }}>Did you mean <strong>{suggest2}</strong>? — fix it</button>}
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

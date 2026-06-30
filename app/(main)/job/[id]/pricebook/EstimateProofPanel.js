'use client';

// Sent-estimate tracker + proof. Shows each estimate's status (viewed/approved/declined…), WHO approved
// and HOW (clean link / phone / in-person), and the append-only timeline. The "Log phone approval" button
// captures an off-link verbal yes — the out-of-state landlord case — with the tech as the witness on record.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { logManualApproval } from './estimateActions';

const money = (n) => '$' + (Number(n) || 0).toLocaleString();
const STATUS = {
  sent: { label: 'Sent', c: 'var(--fg-3)' }, viewed: { label: 'Viewed', c: 'var(--blue)' },
  approved: { label: 'Approved', c: 'var(--green)' }, declined: { label: 'Declined', c: 'var(--red)' },
  question: { label: 'Question', c: 'var(--amber)' }, deposit_requested: { label: 'Deposit', c: 'var(--amber)' },
};
const METHOD_LABEL = { link: 'on their device', phone: 'over the phone', in_person: 'in person', text: 'by text', email: 'by email' };

export default function EstimateProofPanel({ estimates = [] }) {
  const [open, setOpen] = useState(false);
  if (!estimates.length) return null;
  const declined = estimates.filter((e) => e.status === 'declined').length;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box' }}>
        <span style={{ fontWeight: 800 }}>🧾 Sent estimates &amp; approval proof</span>
        <span className="pill" style={{ fontSize: 10 }}>{estimates.length}</span>
        {declined > 0 && <span className="pill" style={{ fontSize: 10, color: 'var(--red)', border: '1px solid var(--red)' }}>{declined} declined</span>}
        <span style={{ marginLeft: 'auto', color: 'var(--fg-3)', fontSize: 12 }}>{open ? '▲ hide' : '▼ show'}</span>
      </button>
      {open && (<>
        <div className="muted" style={{ fontSize: 11.5, margin: '6px 0 10px' }}>Every approval is stamped with who, when, and how — so it can’t be disputed later.</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {estimates.map((e) => <Row key={e.token} e={e} />)}
        </div>
      </>)}
    </div>
  );
}

function Row({ e }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(false);
  const [name, setName] = useState('');
  const [method, setMethod] = useState('phone');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null);
  const st = STATUS[e.status] || STATUS.sent;

  const submit = () => start(async () => {
    setMsg(null);
    const r = await logManualApproval(e.token, { name: name.trim(), method, note: note.trim() });
    setMsg({ ok: r.ok, t: r.msg });
    if (r.ok) { setForm(false); router.refresh(); }
  });

  const input = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '8px 10px', fontSize: 13 };
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--surface-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{e.headline || 'Estimate'}</span>
        <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 13 }}>{money(e.subtotal)}</span>
        <span className="pill" style={{ marginLeft: 'auto', color: st.c, border: `1px solid ${st.c}` }}>{st.label}</span>
      </div>

      {e.status === 'approved' && e.approved_name && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--green)' }}>
          ✓ Approved by <strong>{e.approved_name}</strong> {METHOD_LABEL[e.approval_method] || ''}
          {e.responded_at ? ` · ${new Date(e.responded_at).toLocaleString()}` : ''}
          {e.witnessed_by_name ? <span className="muted"> · witnessed by {e.witnessed_by_name}</span> : null}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <a href={`/e/${e.token}`} target="_blank" rel="noreferrer" className="pill" style={{ color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>Open link</a>
        {e.events?.length ? <button onClick={() => setOpen((o) => !o)} className="pill" style={{ cursor: 'pointer' }}>{open ? 'Hide' : `Timeline (${e.events.length})`}</button> : null}
        {e.status !== 'approved' && e.status !== 'declined' && <button onClick={() => setForm((f) => !f)} className="pill" style={{ cursor: 'pointer', color: 'var(--green)', border: '1px solid var(--green)' }}>📞 Log phone approval</button>}
      </div>

      {open && e.events?.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8, display: 'grid', gap: 5 }}>
          {e.events.map((ev, i) => (
            <div key={i} style={{ fontSize: 11.5, display: 'flex', gap: 8 }}>
              <span className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(ev.created_at).toLocaleString()}</span>
              <span><strong>{ev.event_type}</strong>{ev.actor ? ` · ${ev.actor}` : ''}{ev.method ? ` (${ev.method})` : ''}{ev.note ? ` — ${ev.note}` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10, display: 'grid', gap: 8 }}>
          <div className="muted" style={{ fontSize: 11 }}>Customer approved off the link (e.g. a landlord on the phone). This is logged with you as the witness.</div>
          <input value={name} onChange={(ev) => setName(ev.target.value)} placeholder="Who approved? (full name)" style={input} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['phone', '📞 Phone'], ['in_person', '🤝 In person'], ['text', '💬 Text'], ['email', '📧 Email']].map(([m, l]) => (
              <button key={m} onClick={() => setMethod(m)} className="pill" style={{ cursor: 'pointer', fontWeight: method === m ? 800 : 600, border: method === m ? '1px solid var(--amber)' : '1px solid var(--border)' }}>{l}</button>
            ))}
          </div>
          <input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Note (optional) — e.g. owner, called from 859-…" style={input} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setForm(false)} className="pill" style={{ cursor: 'pointer' }}>Cancel</button>
            <button onClick={submit} disabled={pending || !name.trim()} className="btn" style={{ fontSize: 13, opacity: pending || !name.trim() ? 0.6 : 1 }}>{pending ? 'Logging…' : 'Log approval'}</button>
          </div>
        </div>
      )}
      {msg && <div style={{ fontSize: 12, marginTop: 6, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.t}</div>}
    </div>
  );
}

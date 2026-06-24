'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveCloseout } from './actions';
import { Check, Lock, CircleCheck } from 'lucide-react';

const sel = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' };
const label = { fontSize: 10.5, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 3 };
const PAY = [['', '— how paid —'], ['paid_card', 'Paid · card'], ['paid_cash', 'Paid · cash'], ['check', 'Check'], ['invoiced', 'Invoiced'], ['warranty', 'Warranty'], ['cod', 'COD'], ['no_charge', 'No charge']];

export default function CloseoutV2({ jobId, dispo, needWarranty }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const r = (dispo && dispo.row) || {};
  const [payment, setPayment] = useState(r.payment_disposition || '');
  const [signed, setSigned] = useState(!!r.signed);
  const [signedBy, setSignedBy] = useState(r.signed_by || '');
  const [invoice, setInvoice] = useState(r.invoice_status || 'none');
  const [review, setReview] = useState(!!r.review_requested);
  const [cash, setCash] = useState(r.cash_status || 'n/a');
  const [warranty, setWarranty] = useState(!!r.warranty_packet);
  const [note, setNote] = useState(r.note || '');
  const [msg, setMsg] = useState(null);

  const isCash = payment === 'paid_cash';
  const items = [
    { label: 'Payment disposition', ok: !!payment, req: true },
    { label: 'Customer signed', ok: signed, req: true },
    { label: 'Invoice / receipt', ok: invoice && invoice !== 'none', req: true },
    { label: 'Review requested', ok: review, req: true },
    { label: 'Cash turned in', ok: cash === 'turned_in', req: isCash },
    { label: 'Warranty packet', ok: warranty, req: needWarranty },
  ];
  const missing = items.filter((i) => i.req && !i.ok).map((i) => i.label);
  const ready = missing.length === 0;

  function save() {
    const fd = new FormData();
    fd.set('jobId', jobId); fd.set('payment_disposition', payment); fd.set('signed', signed ? 'true' : 'false'); fd.set('signed_by', signedBy);
    fd.set('invoice_status', invoice); fd.set('review_requested', review ? 'true' : 'false'); fd.set('cash_status', cash); fd.set('warranty_packet', warranty ? 'true' : 'false'); fd.set('note', note);
    setMsg(null);
    start(async () => { const res = await saveCloseout(fd); setMsg(res); if (res.ok) router.refresh(); });
  }

  const cb = (on) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: on ? 'var(--green)' : 'var(--fg-2)' });

  return (
    <div className="card" style={{ marginTop: 10, borderLeft: `3px solid ${ready ? 'var(--green)' : 'var(--amber)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {ready ? <CircleCheck size={20} style={{ color: 'var(--green)' }} /> : <Lock size={18} style={{ color: 'var(--amber)' }} />}
        <div style={{ fontWeight: 800 }}>Closeout checklist</div>
        <span className="pill" style={{ marginLeft: 'auto', fontWeight: 800, color: ready ? 'var(--green)' : 'var(--amber)' }}>{ready ? 'Disposition complete' : `${missing.length} left`}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <div><span style={label}>Payment</span><select value={payment} onChange={(e) => setPayment(e.target.value)} style={{ ...sel, width: '100%' }}>{PAY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><span style={label}>Invoice / receipt</span><select value={invoice} onChange={(e) => setInvoice(e.target.value)} style={{ ...sel, width: '100%' }}><option value="none">— none —</option><option value="sent">Invoice sent</option><option value="receipt_given">Receipt given</option></select></div>
        {isCash && <div><span style={label}>Cash custody</span><select value={cash} onChange={(e) => setCash(e.target.value)} style={{ ...sel, width: '100%' }}><option value="n/a">—</option><option value="pending">Pending turn-in</option><option value="turned_in">Turned in</option></select></div>}
        <div><span style={label}>Signed by</span><input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="customer name" style={{ ...sel, width: '100%' }} autoComplete="off" /></div>
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12 }}>
        <label style={cb(signed)}><input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} /> Customer signed</label>
        <label style={cb(review)}><input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} /> Review requested</label>
        {needWarranty && <label style={cb(warranty)}><input type="checkbox" checked={warranty} onChange={(e) => setWarranty(e.target.checked)} /> Warranty packet sent</label>}
      </div>

      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Closeout note (optional)" style={{ ...sel, width: '100%', marginTop: 12 }} autoComplete="off" />

      {!ready && <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Still needed: {missing.join(', ')}.</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <button type="button" className="btn" onClick={save} disabled={pending} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: pending ? 0.6 : 1 }}><Check size={15} /> {pending ? 'Saving…' : 'Save closeout'}</button>
        {msg && <span style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
      </div>
    </div>
  );
}

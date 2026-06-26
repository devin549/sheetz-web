'use client';

// Report an absence. Policy decides excused/unexcused: attach a doctor's note → AI confirms it's a real
// note (never reads the diagnosis) → emails records@ → EXCUSED. No documentation → unexcused. Same rule
// for everyone — a manager can only override on the record.
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reportAbsence } from './actions';

function fileToScaledDataUrl(file, max = 1300) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); resolve(c.toDataURL('image/jpeg', 0.85)); };
    img.onerror = () => resolve(null);
    const fr = new FileReader(); fr.onload = () => { img.src = fr.result; }; fr.readAsDataURL(file);
  });
}
const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 12px', fontSize: 14 };

export default function AbsenceReport() {
  const router = useRouter();
  const fileRef = useRef();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [doc, setDoc] = useState(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);

  const pickDoc = async (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const url = await fileToScaledDataUrl(f); setDoc(url); e.target.value = ''; };
  const submit = () => { setMsg(null); start(async () => { const r = await reportAbsence({ date, reason, docPhoto: doc }); setMsg(r); if (r.ok) { setDate(''); setReason(''); setDoc(null); setOpen(false); router.refresh(); } }); };

  if (!open) return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setOpen(true)} style={{ width: '100%', background: 'var(--surface-2)', color: 'var(--fg-1)', border: '1px solid var(--border-strong)', padding: '12px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>🤒 Report an absence (out sick / emergency)</button>
      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.status === 'unexcused' ? 'var(--amber)' : 'var(--green)' }}>{msg.msg}</div>}
    </div>
  );

  return (
    <div className="card card-amber" style={{ marginTop: 8, display: 'grid', gap: 9 }}>
      <div style={{ fontWeight: 800 }}>Report an absence</div>
      <label className="muted" style={{ fontSize: 11 }}>Date missed<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inp, marginTop: 3 }} /></label>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Quick reason (not medical details)" style={inp} />
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pickDoc} style={{ display: 'none' }} />
      <button onClick={() => fileRef.current && fileRef.current.click()} style={{ background: doc ? 'color-mix(in oklab, var(--green) 12%, var(--surface-1))' : 'var(--surface-2)', border: '1px solid ' + (doc ? 'var(--green)' : 'var(--purple)'), color: doc ? 'var(--green)' : 'var(--purple)', borderRadius: 8, padding: '10px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{doc ? '✓ Doctor’s note attached — will excuse it' : '📷 Attach a doctor’s note (to excuse it)'}</button>
      <div className="muted" style={{ fontSize: 10.5, lineHeight: 1.5 }}>A verified doctor’s note = <strong style={{ color: 'var(--green)' }}>excused</strong> and is sent to records. No note = <strong style={{ color: 'var(--amber)' }}>unexcused</strong> (2 unexcused/yr forfeits your 5 holidays). The note is checked only to confirm it’s real — the medical reason is never read or stored.</div>
      {msg && !msg.ok && <div style={{ color: 'var(--red)', fontSize: 12 }}>{msg.msg}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={submit} disabled={pending || !date} className="btn" style={{ opacity: (pending || !date) ? 0.6 : 1 }}>{pending ? 'Submitting…' : 'Submit'}</button>
        <button onClick={() => setOpen(false)} className="btn btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

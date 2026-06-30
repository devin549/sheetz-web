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
const CATS = [['sick', '🤒 Sick'], ['bereavement', '🕯️ Funeral'], ['jury_duty', '⚖️ Jury duty'], ['other', '📋 Other']];

export default function AbsenceReport() {
  const router = useRouter();
  const fileRef = useRef();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('sick');
  const [relation, setRelation] = useState('immediate');
  const [reason, setReason] = useState('');
  const [doc, setDoc] = useState(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const autoExcused = category === 'bereavement'; // jury duty needs proof now — not auto-excused
  const isJury = category === 'jury_duty';
  const docNoun = isJury ? 'jury summons / court proof' : 'doctor’s note';

  const pickDoc = async (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const url = await fileToScaledDataUrl(f); setDoc(url); e.target.value = ''; };
  const submit = () => { setMsg(null); start(async () => { const r = await reportAbsence({ date, reason, category, relation, docPhoto: doc }); setMsg(r); if (r.ok) { setDate(''); setReason(''); setDoc(null); setCategory('sick'); setOpen(false); router.refresh(); } }); };

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

      {/* Reason category — bereavement / jury duty auto-excuse without a note. */}
      <div>
        <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Reason</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CATS.map(([k, label]) => {
            const on = category === k;
            return <button key={k} type="button" onClick={() => setCategory(k)} style={{ fontSize: 12.5, fontWeight: on ? 800 : 600, padding: '6px 11px', borderRadius: 14, cursor: 'pointer', background: on ? 'var(--amber)' : 'var(--surface-2)', color: on ? '#1a1206' : 'var(--fg-2)', border: '1px solid ' + (on ? 'var(--amber)' : 'var(--border)') }}>{label}</button>;
          })}
        </div>
      </div>

      {/* Bereavement: immediate vs extended drives the paid-day count. */}
      {category === 'bereavement' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 11 }}>Who:</span>
          {[['immediate', 'Immediate family (spouse/child/parent/sibling)'], ['extended', 'Extended / close']].map(([k, label]) => {
            const on = relation === k;
            return <button key={k} type="button" onClick={() => setRelation(k)} style={{ fontSize: 11.5, fontWeight: on ? 800 : 600, padding: '5px 9px', borderRadius: 12, cursor: 'pointer', background: on ? 'var(--surface-3)' : 'var(--surface-2)', color: on ? 'var(--fg-1)' : 'var(--fg-3)', border: '1px solid ' + (on ? 'var(--amber-dim)' : 'var(--border)') }}>{label}</button>;
          })}
        </div>
      )}

      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Quick note (optional — not medical details)" style={inp} />

      {/* Documentation: bereavement needs none. Sick/other = doctor's note. Jury duty = summons / court proof. */}
      {!autoExcused && (<>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pickDoc} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current && fileRef.current.click()} style={{ background: doc ? 'color-mix(in oklab, var(--green) 12%, var(--surface-1))' : 'var(--surface-2)', border: '1px solid ' + (doc ? 'var(--green)' : 'var(--purple)'), color: doc ? 'var(--green)' : 'var(--purple)', borderRadius: 8, padding: '10px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{doc ? `✓ ${docNoun} attached` : `📷 Attach your ${docNoun}`}</button>
      </>)}

      <div className="muted" style={{ fontSize: 10.5, lineHeight: 1.5 }}>
        {autoExcused
          ? <>🕯️ <strong style={{ color: 'var(--green)' }}>Excused</strong> — a funeral doesn’t need a note and is never a strike.</>
          : isJury
            ? <>⚖️ <strong>Jury duty needs proof</strong> — your summons or the court’s <strong>proof of service</strong>. Attach it and records verifies it (held <strong style={{ color: 'var(--amber)' }}>pending</strong> until confirmed, then excused — never a strike). No proof = it stays pending.</>
            : <>A verified doctor’s note = <strong style={{ color: 'var(--green)' }}>excused</strong> (sent to records). No note = <strong style={{ color: 'var(--amber)' }}>unexcused</strong> (2 unexcused/yr forfeits your 5 holidays). The note is only confirmed real — the medical reason is never read or stored.</>}
      </div>
      {msg && !msg.ok && <div style={{ color: 'var(--red)', fontSize: 12 }}>{msg.msg}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={submit} disabled={pending || !date} className="btn" style={{ opacity: (pending || !date) ? 0.6 : 1 }}>{pending ? 'Submitting…' : 'Submit'}</button>
        <button onClick={() => setOpen(false)} className="btn btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

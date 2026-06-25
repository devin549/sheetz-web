'use client';

// Per-job financial inputs for pay: material cost + dispatch fee. These feed the commission formula
// (subtotal = revenue − dispatch(capped) − material×markup). Without them, /pay overstates commission.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setJobCosts } from './actions';

export default function JobCosts({ jobId, materialCents, dispatchCents, canEdit }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [mat, setMat] = useState(materialCents ? (materialCents / 100).toString() : '');
  const [disp, setDisp] = useState(dispatchCents ? (dispatchCents / 100).toString() : '');
  if (!canEdit) return null;
  const save = () => { setMsg(null); start(async () => { const r = await setJobCosts(jobId, Number(mat) || 0, Number(disp) || 0); setMsg(r); if (r?.ok) router.refresh(); }); };
  const input = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14, width: '100%' };

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>💵</span>
        <div style={{ fontWeight: 800 }}>Job costs <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— feeds pay</span></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--fg-3)' }}>Material cost ($)
          <input type="number" inputMode="decimal" value={mat} onChange={(e) => setMat(e.target.value)} placeholder="0" style={{ ...input, marginTop: 3 }} /></label>
        <label style={{ fontSize: 11, color: 'var(--fg-3)' }}>Dispatch fee ($)
          <input type="number" inputMode="decimal" value={disp} onChange={(e) => setDisp(e.target.value)} placeholder="0" style={{ ...input, marginTop: 3 }} /></label>
      </div>
      <button onClick={save} disabled={pending} className="btn" style={{ marginTop: 10, opacity: pending ? 0.6 : 1 }}>{pending ? 'Saving…' : 'Save costs'}</button>
      {msg && <span style={{ fontSize: 12, marginLeft: 10, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
      <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Material cost drives the markup tier (2× ≤$399 · 1.5× &gt;$399) + your premium. Dispatch fee is capped at $125/job.</div>
    </div>
  );
}

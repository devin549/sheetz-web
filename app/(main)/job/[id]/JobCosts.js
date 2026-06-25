'use client';

// Per-job financial inputs for pay: material cost + dispatch fee. These feed the commission formula
// (subtotal = revenue − dispatch(capped) − material×markup). Without them, /pay overstates commission.
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setJobCosts } from './actions';
import { marginVerdict } from '@/lib/marginCoach';

export default function JobCosts({ jobId, materialCents, dispatchCents, canEdit, revenue = 0, roastLevel = 'PG', name = '' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [mat, setMat] = useState(materialCents ? (materialCents / 100).toString() : '');
  const [disp, setDisp] = useState(dispatchCents ? (dispatchCents / 100).toString() : '');
  // 🌽👑 / 💩 live margin verdict — recomputed as the tech types costs.
  const verdict = useMemo(() => marginVerdict({ revenue, materialCost: Number(mat) || 0, dispatchFee: Number(disp) || 0, level: roastLevel, name }), [revenue, mat, disp, roastLevel, name]);
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

      {/* 🌽👑 Corn Crown / 💩 Golden Turd — live margin verdict (private to the tech, never customer-facing) */}
      {verdict && (
        <div style={{ marginTop: 12, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start',
          border: '1px solid ' + (verdict.tier === 'corn' ? 'var(--green)' : '#d32f2f'),
          background: verdict.tier === 'corn' ? 'color-mix(in oklab, var(--green) 12%, var(--surface-1))' : 'color-mix(in oklab, #d32f2f 12%, var(--surface-1))' }}>
          <span style={{ fontSize: 30, lineHeight: 1 }}>{verdict.char}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 13, color: verdict.tier === 'corn' ? 'var(--green)' : '#ff8a80' }}>{verdict.speaker} says…</strong>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, fontSize: 13, color: verdict.tier === 'corn' ? 'var(--green)' : '#ff8a80' }}>{verdict.pct}% margin</span>
              <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--fg-3)' }}>🔒 private · roast {roastLevel}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.5, marginTop: 4 }}>{verdict.body}</div>
            {verdict.action && <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, color: '#ff8a80' }}>🎯 {verdict.action}</div>}
          </div>
        </div>
      )}

      <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Material cost drives the markup tier (2× ≤$399 · 1.5× &gt;$399) + your premium. Dispatch fee is capped at $125/job.</div>
    </div>
  );
}

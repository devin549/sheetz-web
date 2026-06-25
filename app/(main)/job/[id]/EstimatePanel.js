'use client';

// Estimate / quote cockpit panel. Estimates close on an issue photo + an OUTCOME (no before/after/video).
// Picking "Sold now" offers Convert → creates a work job that gets the full job closeout rules.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setEstimateOutcome, convertEstimateToWork } from './actions';
import { ESTIMATE_OUTCOMES } from '@/lib/qa';

export default function EstimatePanel({ jobId, outcome, convertedToJobId, canAct }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const pick = (code) => { setMsg(null); start(async () => { const r = await setEstimateOutcome(jobId, code); setMsg(r); if (r?.ok) router.refresh(); }); };
  const convert = () => { setMsg(null); start(async () => { const r = await convertEstimateToWork(jobId); setMsg(r); if (r?.ok) { router.refresh(); if (r.jobId) router.push(`/job/${r.jobId}`); } }); };

  return (
    <div className="card card-amber" style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>🧲</span>
        <div style={{ fontWeight: 800 }}>Estimate outcome</div>
        <span className="pill" style={{ marginLeft: 'auto', color: outcome ? 'var(--green)' : 'var(--amber)' }}>{outcome ? 'set' : 'required to close'}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {ESTIMATE_OUTCOMES.map((o) => {
          const on = outcome === o.code;
          return (
            <button key={o.code} type="button" disabled={pending || !canAct} onClick={() => pick(o.code)}
              style={{ padding: '9px 12px', borderRadius: 9, fontSize: 13, fontWeight: on ? 800 : 600, cursor: canAct ? 'pointer' : 'default',
                border: '1px solid ' + (on ? 'var(--amber)' : 'var(--border-strong)'), background: on ? 'var(--amber)' : 'var(--surface-2)', color: on ? '#1a1206' : 'var(--fg-2)' }}>
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Estimates need just an issue photo (model/serial photo if equipment) + an outcome — no before/after or walkthrough video.</div>

      {outcome === 'sold_now' && canAct && (
        convertedToJobId ? (
          <a href={`/job/${convertedToJobId}`} className="btn" style={{ marginTop: 10, display: 'inline-flex', textDecoration: 'none' }}>Open the work job →</a>
        ) : (
          <button onClick={convert} disabled={pending} className="btn" style={{ marginTop: 10, opacity: pending ? 0.6 : 1 }}>
            ✅ Convert to work order — apply full job closeout
          </button>
        )
      )}
      {msg && <div style={{ fontSize: 12, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </div>
  );
}

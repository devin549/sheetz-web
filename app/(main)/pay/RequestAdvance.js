'use client';

// Earned-wage advance request. Per the live iPad screen it "Sends to OM for approval" — never an
// auto-payout (the no-auto-send rule). v1 is the UI + the routing promise; the OM approval queue +
// payout rail get wired with the live payroll feed. Kept honest: it tells the tech what will happen.
import { useState } from 'react';

export default function RequestAdvance({ available }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ background: 'linear-gradient(180deg, #4caf50 0%, #1b5e20 100%)', color: 'white', border: 'none', padding: '12px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(76,175,80,0.4)', whiteSpace: 'nowrap' }}>
        💵 Request Advance
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="card card-amber" style={{ maxWidth: 380, width: '100%' }}>
            <div className="h1" style={{ fontSize: 18, margin: 0 }}>💵 Request Advance</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
              You can take up to <strong style={{ color: 'var(--green-bright)' }}>{available}</strong> now (30% of net earned, max 2/wk).
              This <strong>sends to the Office Manager for approval</strong> — it’s never paid out automatically.
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Standard ACH $0 · instant $2.50. The OM approval queue + payout wire on with the live payroll sync.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setOpen(false)} className="btn btn-ghost" style={{ flex: 1 }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

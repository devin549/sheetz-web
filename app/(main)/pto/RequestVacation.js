'use client';

// Request Vacation — per the live screen it "routes through Field Supervisor" (no auto-approve).
// v1 = UI + the routing promise; the FS approval queue wires with the time-off feed.
import { useState } from 'react';

export default function RequestVacation() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ width: '100%', background: 'var(--amber-dim)', color: '#000', border: 'none', padding: '14px', borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
        + Request Vacation
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="card card-amber" style={{ maxWidth: 380, width: '100%' }}>
            <div className="h1" style={{ fontSize: 18, margin: 0 }}>📅 Request Vacation</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
              Pick your dates + reason and it <strong>routes to your Field Supervisor</strong> for approval — never auto-approved.
              Paid at your hourly rate (no commission), drawn from your 40-hr balance.
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>The date picker + FS approval queue wire on with the time-off feed.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setOpen(false)} className="btn btn-ghost" style={{ flex: 1 }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

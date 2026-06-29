'use client';

// Done + cancelled jobs collapse into this tray so the active route up top stays clean (the mockup's
// "Done today (2) · Cancelled (1) … View tray"). Tap to expand the finished/cancelled cards.
import { useState } from 'react';

export default function DoneTray({ doneCount = 0, cancelledCount = 0, children }) {
  const [open, setOpen] = useState(false);
  if (doneCount + cancelledCount === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 10, border: '1px dashed var(--border-strong)', background: 'var(--surface-1)', color: 'var(--fg-2)', cursor: 'pointer', fontSize: 12.5, textAlign: 'left' }}>
        <span style={{ fontSize: 15 }}>🗂</span>
        <span style={{ fontWeight: 700 }}>
          {doneCount > 0 && <span style={{ color: 'var(--green)' }}>✓ {doneCount} done today</span>}
          {doneCount > 0 && cancelledCount > 0 && <span className="muted"> · </span>}
          {cancelledCount > 0 && <span style={{ color: 'var(--fg-3)' }}>{cancelledCount} cancelled</span>}
        </span>
        <span className="muted" style={{ fontSize: 11, flex: 1, minWidth: 0 }}>— collapsed so your active route stays clean</span>
        <span style={{ color: 'var(--amber)', fontWeight: 800, flexShrink: 0 }}>{open ? 'Hide ▴' : 'View tray ▾'}</span>
      </button>
      {open && <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>{children}</div>}
    </div>
  );
}

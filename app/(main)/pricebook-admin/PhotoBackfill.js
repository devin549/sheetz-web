'use client';

// 📸 Bulk photo backfill — one button chips through every photoless item via image search, batch by batch,
// showing live progress. Idempotent on the server (only items without a photo), so Stop + resume is safe and
// any wrong pick is swapped per-item in the catalog drawer's 🔎 Find tool. Managers only (server re-gates).
import { useEffect, useRef, useState } from 'react';
import { backfillItemPhotos } from '../catalog/photoActions';

export default function PhotoBackfill() {
  const [missing, setMissing] = useState(null);   // null = still counting
  const [running, setRunning] = useState(false);
  const [stat, setStat] = useState({ filled: 0, failed: 0 });
  const [msg, setMsg] = useState(null);
  const stopRef = useRef(false);

  const count = async () => { const r = await backfillItemPhotos({ limit: 0 }); if (r.ok) setMissing(r.remaining); else setMsg(r.msg); };
  useEffect(() => { count(); }, []);

  const run = async () => {
    setRunning(true); stopRef.current = false; setMsg(null); setStat({ filled: 0, failed: 0 });
    let filled = 0, failed = 0, afterId = null, i = 0;
    // Walk the whole missing set once via the server's id cursor. Hard backstop = (items/batch) + slack, so a
    // bug can never burn quota indefinitely. Terminates on done / no-more-cursor / Stop / !ok / cap.
    const cap = Math.ceil(((missing || 0) + 8) / 8) + 5;
    while (!stopRef.current && i < cap) {
      i++;
      const r = await backfillItemPhotos({ limit: 8, afterId });
      if (!r.ok) { setMsg(r.msg); break; }
      filled += r.filled; failed += r.failed;
      setStat({ filled, failed });
      if (typeof r.remaining === 'number') setMissing(r.remaining);
      afterId = r.lastId;
      if (r.done || !afterId) break;   // reached the tail, or nothing left after the cursor
    }
    setRunning(false);
  };
  const halt = () => { stopRef.current = true; };

  const done = missing === 0;
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800 }}>📸 Photo backfill {missing != null && missing > 0 && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: 'var(--amber)', border: '1px solid var(--amber-dim)', borderRadius: 6, padding: '1px 6px' }}>{missing} missing</span>}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {missing == null ? 'Counting items without a photo…'
              : done ? 'Every item has a photo. 🎉'
              : 'Auto-finds a real product photo for each item without one (uses image search). Swap any miss in the item’s 🔎 Find tool.'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {!running
            ? <button className="btn btn-primary" disabled={missing == null || done} onClick={run}>{missing && missing > 0 ? `Auto-fill ${missing} photo${missing === 1 ? '' : 's'}` : 'Auto-fill photos'}</button>
            : <button className="btn" onClick={halt} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>■ Stop</button>}
        </div>
      </div>

      {(running || stat.filled > 0 || stat.failed > 0) && (
        <div style={{ marginTop: 10, fontSize: 12.5 }}>
          {running && <span style={{ color: 'var(--amber)', fontWeight: 700 }}>Filling… </span>}
          <span style={{ color: 'var(--green)', fontWeight: 700 }}>{stat.filled} added</span>
          {stat.failed > 0 && <span className="muted"> · {stat.failed} had no good match (left for you to set)</span>}
          {missing != null && <span className="muted"> · {missing} remaining</span>}
        </div>
      )}
      {msg && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>{msg}</div>}
    </div>
  );
}

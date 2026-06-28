'use client';

// 🧠 AI cross-sell seeder — one button fills "commonly added with this" for every item that has no AI picks
// yet, batch by batch, with live progress. Idempotent on the server (skips items already seeded), so Stop +
// resume is safe. These are STARTER picks; real job co-occurrence outranks them once tickets close.
import { useEffect, useRef, useState } from 'react';
import { seedRecommendations } from './recActions';

export default function RecBackfill() {
  const [missing, setMissing] = useState(null);
  const [running, setRunning] = useState(false);
  const [stat, setStat] = useState({ filled: 0, failed: 0 });
  const [msg, setMsg] = useState(null);
  const stopRef = useRef(false);

  const count = async () => { const r = await seedRecommendations({ limit: 0 }); if (r.ok) setMissing(r.remaining); else setMsg(r.msg); };
  useEffect(() => { count(); }, []);

  const run = async () => {
    setRunning(true); stopRef.current = false; setMsg(null); setStat({ filled: 0, failed: 0 });
    let filled = 0, failed = 0, afterId = null, i = 0;
    const cap = Math.ceil(((missing || 0) + 12) / 12) + 5;   // hard backstop so a bug can't loop the AI forever
    while (!stopRef.current && i < cap) {
      i++;
      const r = await seedRecommendations({ limit: 12, afterId });
      if (!r.ok) { setMsg(r.msg); break; }
      filled += r.filled; failed += r.failed;
      setStat({ filled, failed });
      if (typeof r.remaining === 'number') setMissing(r.remaining);
      afterId = r.lastId;
      if (r.done || !afterId) break;
    }
    setRunning(false);
  };
  const halt = () => { stopRef.current = true; };

  const done = missing === 0;
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800 }}>🧠 AI cross-sell seeding {missing != null && missing > 0 && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: 'var(--amber)', border: '1px solid var(--amber-dim)', borderRadius: 6, padding: '1px 6px' }}>{missing} to seed</span>}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {missing == null ? 'Counting items without AI picks…'
              : done ? 'Every item has starter “commonly added” picks. 🎉 Real jobs refine them from here.'
              : 'Fills “commonly added with this” with smart starter picks per item. As tickets close, real job data outranks these.'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {!running
            ? <button className="btn btn-primary" disabled={missing == null || done} onClick={run}>{missing && missing > 0 ? `Seed ${missing} item${missing === 1 ? '' : 's'}` : 'Seed picks'}</button>
            : <button className="btn" onClick={halt} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>■ Stop</button>}
        </div>
      </div>

      {(running || stat.filled > 0 || stat.failed > 0) && (
        <div style={{ marginTop: 10, fontSize: 12.5 }}>
          {running && <span style={{ color: 'var(--amber)', fontWeight: 700 }}>Seeding… </span>}
          <span style={{ color: 'var(--green)', fontWeight: 700 }}>{stat.filled} seeded</span>
          {stat.failed > 0 && <span className="muted"> · {stat.failed} no good pairing (skipped)</span>}
          {missing != null && <span className="muted"> · {missing} remaining</span>}
        </div>
      )}
      {msg && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>{msg}</div>}
    </div>
  );
}

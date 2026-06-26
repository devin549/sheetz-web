'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { respondReservation } from '../tools/locateActions';

const STATUS = { reserved: ['var(--amber)', 'Reserved'], pickup_pending: ['var(--amber)', 'Pickup pending'], accepted: ['var(--green)', 'Accepted'], problem: ['var(--red)', 'Problem'] };
const fmt = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

export default function PickupsClient({ mine = [], tray = [], isDispatch = false }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const respond = (id, r) => start(async () => { const res = await respondReservation(id, r); if (res.ok) router.refresh(); else setMsg(res.msg); });

  return (
    <>
      {/* HOLDER inbox — requests aimed at me */}
      {mine.length > 0 && (
        <>
          <div className="h2" style={{ marginTop: 4 }}>📥 Coming for your gear ({mine.length})</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {mine.map((r) => (
              <div key={r.id} className="card card-amber" style={{ display: 'grid', gap: 7 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{r.requested_by_name || 'A tech'} is coming for {r.item_name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{r.job_id ? `job #${String(r.job_id).slice(0, 8)} · ` : ''}{r.eta_min ? `ETA ~${r.eta_min}m · ` : ''}requested {fmt(r.created_at)}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => respond(r.id, 'accept')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--green)', border: '1px solid var(--green)' }}>✓ Accept</button>
                  <button onClick={() => respond(r.id, 'problem')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--red)', border: '1px solid var(--red)' }}>⚠ Problem</button>
                  <button onClick={() => respond(r.id, 'loaned')} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--fg-2)' }}>↪ Already loaned out</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* DISPATCH tray */}
      <div className="h2" style={{ marginTop: 18 }}>{isDispatch ? 'Dispatch tray' : 'In progress'}{tray.length ? ` (${tray.length})` : ''}</div>
      {tray.length === 0 ? (
        <div className="card muted" style={{ fontSize: 13.5 }}>No pickups in progress. 👍</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {tray.map((r) => {
            const [col, label] = STATUS[r.status] || ['var(--fg-3)', r.status];
            return (
              <div key={r.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15 }}>{r.item_kind === 'tool' ? '🔧' : '📦'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.item_name}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {r.requested_by_name || 'tech'} → {r.holder_name || r.holder_type}
                      {r.job_id ? ` · job #${String(r.job_id).slice(0, 8)}` : ''}
                      {r.eta_min ? ` · ETA there ~${r.eta_min}m` : ''}
                    </div>
                  </div>
                  <span className="pill" style={{ fontSize: 9.5, color: col, border: `1px solid ${col}` }}>{label}</span>
                </div>
                {r.nextJob && <div style={{ fontSize: 11.5, marginTop: 6, color: 'var(--amber)', fontWeight: 700 }}>⚠ Next job {r.nextJob} may be affected — check the schedule.</div>}
              </div>
            );
          })}
        </div>
      )}
      {msg && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{msg}</div>}
    </>
  );
}

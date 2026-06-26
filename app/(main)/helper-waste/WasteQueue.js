'use client';

// Manager review queue + reports. Each tech-caused idle entry gets a decision (where the cost lands).
// The helper was already paid — this assigns accountability + leaves an audit trail.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MANAGER_DECISIONS, reasonMeta, decisionLabel } from '@/lib/helpers';
import { decideWaste } from './actions';

const hm = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h ${m}m` : `${m}m`; };
const fmt = (iso) => { try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return ''; } };
const barMax = (rows) => Math.max(1, ...rows.map((r) => r.min));

export default function WasteQueue({ queue = [], decided = [], techRows = [], reasonRows = [] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState(null);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null);

  const decide = (id, decision) => start(async () => {
    const r = await decideWaste(id, decision, { note });
    if (r.ok) { setOpenId(null); setNote(''); router.refresh(); } else setMsg(r.msg);
  });
  const tMax = barMax(techRows), rMax = barMax(reasonRows);

  return (
    <>
      <div className="h2" style={{ marginTop: 18 }}>Review queue{queue.length ? ` (${queue.length})` : ''}</div>
      {queue.length === 0 ? (
        <div className="card muted" style={{ fontSize: 13.5 }}>Nothing to review — no tech-caused helper idle is waiting. 👍</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {queue.map((w) => {
            const rm = reasonMeta(w.reason);
            return (
              <div key={w.id} style={{ padding: '11px 13px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--amber-dim)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16 }}>{rm.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{w.helper_name} idle {hm(w.mins)} — {rm.label}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>Responsible: {w.lead_tech_name || '—'} · {fmt(w.created_at)}</div>
                  </div>
                  <button onClick={() => { setOpenId(openId === w.id ? null : w.id); setNote(''); setMsg(null); }} className="btn btn-ghost" style={{ fontSize: 12.5 }}>{openId === w.id ? 'Close' : 'Assign cost →'}</button>
                </div>
                {openId === w.id && (
                  <div style={{ marginTop: 9, display: 'grid', gap: 8 }}>
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional — shown in the audit trail)" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '8px 10px', fontSize: 12.5 }} />
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {MANAGER_DECISIONS.map((d) => (
                        <button key={d.value} onClick={() => decide(w.id, d.value)} disabled={pending} className="pill" style={{ cursor: 'pointer', fontSize: 12 }}>{d.icon} {d.label}</button>
                      ))}
                    </div>
                    {msg && <div style={{ color: 'var(--red)', fontSize: 12 }}>{msg}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reports */}
      <div className="h2" style={{ marginTop: 20 }}>Idle by responsible tech (14d)</div>
      <div className="card" style={{ display: 'grid', gap: 7 }}>
        {techRows.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No tech-caused idle logged.</div>}
        {techRows.map((t) => (
          <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 130, fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>{t.name}</span>
            <span style={{ flex: 1, height: 16, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(t.min / tMax) * 100}%`, background: 'var(--amber)' }} /></span>
            <span style={{ width: 64, textAlign: 'right', fontSize: 12, fontWeight: 700 }}>{hm(t.min)}</span>
          </div>
        ))}
      </div>

      <div className="h2" style={{ marginTop: 20 }}>Idle by reason (14d)</div>
      <div className="card" style={{ display: 'grid', gap: 7 }}>
        {reasonRows.length === 0 && <div className="muted" style={{ fontSize: 13 }}>None logged.</div>}
        {reasonRows.map((r) => (
          <div key={r.reason} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 150, fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>{r.icon} {r.label}{r.tech ? ' ⚠' : ''}</span>
            <span style={{ flex: 1, height: 16, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(r.min / rMax) * 100}%`, background: r.tech ? 'var(--amber)' : 'var(--fg-3)' }} /></span>
            <span style={{ width: 64, textAlign: 'right', fontSize: 12, fontWeight: 700 }}>{hm(r.min)}</span>
          </div>
        ))}
      </div>

      {decided.length > 0 && (
        <>
          <div className="h2" style={{ marginTop: 20 }}>Recently decided</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {decided.map((w) => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '6px 10px', borderRadius: 7, background: 'var(--surface-1)' }}>
                <span style={{ flex: 1, minWidth: 0 }}>{reasonMeta(w.reason).icon} {w.helper_name} · {hm(w.mins)} · {w.lead_tech_name || '—'}</span>
                <span className="pill" style={{ fontSize: 10 }}>{decisionLabel(w.manager_decision)}</span>
                <span className="pill" style={{ fontSize: 9.5, color: w.payroll_status === 'applied' ? 'var(--green)' : 'var(--fg-3)' }}>{w.payroll_status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

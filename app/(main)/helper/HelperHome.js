'use client';

// Helper phone home — the "must not be lost" flow. (1) Tag the lead tech you're riding with (captures
// GPS + device + window). (2) See pairing status (pending → accept/dispute window countdown → active).
// (3) Tap an idle REASON when you're stuck; tap "Back to work" when moving again. You're always PAID —
// idle is logged for a manager to review, never auto-deducted.
import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { WASTE_REASONS, reasonMeta } from '@/lib/helpers';
import { pairWithTech, startWaste, endWaste } from './actions';

const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 10, padding: '12px', fontSize: 15 };
const hm = (min) => { const h = Math.floor(min / 60), m = min % 60; return h ? `${h}h ${m}m` : `${m}m`; };

export default function HelperHome({ pairing, techs = [], openWaste, summary }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [gps, setGps] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { enableHighAccuracy: true, timeout: 8000 });
    }
  }, []);

  const run = (fn) => { setMsg(null); start(async () => { const r = await fn(); if (r && r.msg) setMsg(r); router.refresh(); }); };
  const pair = (form) => { setMsg(null); start(async () => { const r = await pairWithTech(form); setMsg(r); router.refresh(); }); };

  // ── Not paired → pick your lead ──
  if (!pairing) {
    return (
      <>
        <div className="card card-amber" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>🤝 Who are you with today?</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Tag the lead tech you’re riding with. They’ll get an accept/dispute alert. We save your GPS + device so your hours match their jobs automatically.</div>
          <form action={pair} style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <input type="hidden" name="lat" value={gps?.lat || ''} />
            <input type="hidden" name="lng" value={gps?.lng || ''} />
            <input type="hidden" name="device" value={typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 100) : ''} />
            {techs.length > 0 ? (
              <select name="lead_tech_name" required style={inp} defaultValue="" onChange={(e) => { const o = e.target.selectedOptions[0]; const h = e.target.form.querySelector('input[name=lead_tech_id]'); if (h) h.value = o?.dataset.id || ''; }}>
                <option value="" disabled>Pick your lead tech…</option>
                {techs.map((t) => <option key={t.id || t.name} value={t.name} data-id={t.id || ''}>{t.name}</option>)}
              </select>
            ) : (
              <input name="lead_tech_name" required placeholder="Lead tech’s name" style={inp} autoComplete="off" />
            )}
            <input type="hidden" name="lead_tech_id" value="" />
            <button className="btn" type="submit" disabled={pending} style={{ padding: 14, fontSize: 15 }}>{pending ? 'Pairing…' : '🤝 I’m with this tech'}</button>
            {gps && <div className="muted" style={{ fontSize: 11 }}>📍 Location captured</div>}
          </form>
        </div>
        {msg && <div style={{ fontSize: 13, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
      </>
    );
  }

  // ── Paired → status + waste ──
  const statusColor = pairing.active ? 'var(--green)' : 'var(--amber)';
  return (
    <>
      <div className="card" style={{ marginTop: 12, borderLeft: `3px solid ${statusColor}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>🤝 With {pairing.lead_tech_name}</div>
            <div style={{ fontSize: 12.5, color: statusColor, fontWeight: 700, marginTop: 2 }}>
              {pairing.active ? '✓ Active — your hours follow their jobs' : pairing.status === 'disputed' ? '✗ Disputed — see a manager' : `⏳ Waiting for ${pairing.lead_tech_name} to accept${pairing.autoMin ? ` · auto-confirms in ${pairing.autoMin}m` : ''}`}
            </div>
          </div>
        </div>
      </div>

      {/* day summary */}
      <div className="card" style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Paid today</div><div style={{ fontSize: 20, fontWeight: 800 }}>{hm(summary.paidMin)}</div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Productive</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{hm(summary.productiveMin)}</div></div>
        <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Idle</div><div style={{ fontSize: 20, fontWeight: 800, color: summary.idleMin ? 'var(--amber)' : 'var(--fg-2)' }}>{hm(summary.idleMin)}</div></div>
      </div>

      {/* waste — open entry, or the reason grid */}
      {openWaste ? (
        <div className="card card-amber" style={{ marginTop: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{reasonMeta(openWaste.reason).icon} {reasonMeta(openWaste.reason).label} — clock running</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>You’re still on the clock and getting paid. Tap when you’re moving again.</div>
          <button onClick={() => run(() => endWaste())} disabled={pending} className="btn" style={{ marginTop: 10, padding: 14, fontSize: 15, width: '100%' }}>▶ Back to work</button>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Stuck waiting? Tap why — you stay paid, the office sees it:</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {WASTE_REASONS.map((r) => (
              <button key={r.reason} onClick={() => run(() => startWaste(r.reason))} disabled={pending}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '14px 6px', borderRadius: 12, cursor: 'pointer', background: 'var(--surface-2)', border: `1px solid ${r.techCaused ? 'var(--amber-dim)' : 'var(--border)'}`, color: 'var(--fg-1)', fontSize: 11.5, fontWeight: 700 }}>
                <span style={{ fontSize: 22 }}>{r.icon}</span>{r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </>
  );
}

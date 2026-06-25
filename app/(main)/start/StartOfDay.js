'use client';

// Start-of-Day — tech/iPad checklist. Big tap targets, fast. Critical items must be checked before
// "I'm ready for dispatch". This is the tech's own readiness gate; it does NOT block job access.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { saveShift } from './actions';
import { CircleCheck, Circle, Truck, Wrench, Shirt, ClipboardList, Radio, BookCheck } from 'lucide-react';

export default function StartOfDay({ name, jobs = [], onCall, saved }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [checks, setChecks] = useState(() => (saved && saved.checklist) || {});
  const [missing, setMissing] = useState((saved && saved.notes) || '');

  const ITEMS = [
    { key: 'clocked_in', label: 'On shift / clocked in', icon: Radio, req: true },
    { key: 'truck', label: 'Truck assigned & fueled', icon: Truck, req: true },
    { key: 'crew', label: 'Helper confirmed (or solo)', icon: ClipboardList, req: true },
    { key: 'tools', label: 'Tool check done — nothing missing', icon: Wrench, req: true },
    { key: 'uniform', label: 'Uniform + truck ready (clean, safety gear)', icon: Shirt, req: true },
    { key: 'handbook', label: 'Handbook re-signed (if due)', icon: BookCheck, req: false },
    ...(onCall ? [{ key: 'oncall', label: `On-call acknowledged — ${onCall}`, icon: Radio, req: true }] : []),
    { key: 'jobs_reviewed', label: "Reviewed today's jobs", icon: ClipboardList, req: true },
  ];
  const required = ITEMS.filter((i) => i.req).map((i) => i.key);
  const allReq = required.every((k) => checks[k]);
  const toggle = (k) => setChecks((c) => ({ ...c, [k]: !c[k] }));

  const persist = (ready) => { setMsg(null); start(async () => { const r = await saveShift('sod', checks, ready, {}, missing); setMsg(r); if (r?.ok) router.refresh(); }); };

  return (
    <div className="wrap" style={{ maxWidth: 620 }}>
      <div className="h1" style={{ marginBottom: 2 }}>🌅 Start of Day</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Good morning, {name}. Quick check before you roll.{saved?.ready ? ' · ✅ Ready' : ''}</div>

      {/* today's jobs preview */}
      <div className="card card-amber" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800 }}>Today · {jobs.length} job{jobs.length === 1 ? '' : 's'}</span>
          <Link href="/my-day" className="pill" style={{ marginLeft: 'auto', color: 'var(--amber)' }}>Open My Day →</Link>
        </div>
        {jobs.slice(0, 5).map((j) => (
          <div key={j.id} className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>🕐 {j.time} · {j.customer}{j.type ? ` · ${j.type}` : ''}</div>
        ))}
        {!jobs.length && <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>No jobs scheduled yet — dispatch may add some.</div>}
      </div>

      {/* checklist */}
      <div style={{ display: 'grid', gap: 8 }}>
        {ITEMS.map((it) => {
          const on = !!checks[it.key]; const I = it.icon;
          return (
            <button key={it.key} onClick={() => toggle(it.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                border: '1px solid ' + (on ? 'var(--green)' : 'var(--border-strong)'), background: on ? 'color-mix(in oklab, var(--green) 10%, var(--surface-1))' : 'var(--surface-2)' }}>
              {on ? <CircleCheck size={24} style={{ color: 'var(--green)', flexShrink: 0 }} /> : <Circle size={24} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />}
              <I size={18} style={{ color: on ? 'var(--green)' : 'var(--fg-3)', flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: on ? 'var(--fg-1)' : 'var(--fg-2)' }}>{it.label}{it.req ? <span style={{ color: 'var(--amber)' }}> *</span> : null}</span>
            </button>
          );
        })}
      </div>

      {!checks.tools && (
        <input value={missing} onChange={(e) => setMissing(e.target.value)} placeholder="Missing a tool? Note it for the shop (optional)"
          style={{ width: '100%', marginTop: 10, background: 'var(--surface-2)', border: '1px solid var(--amber-dim)', color: 'var(--fg-1)', borderRadius: 8, padding: '11px', fontSize: 13 }} />
      )}

      <button onClick={() => persist(true)} disabled={pending || !allReq}
        style={{ width: '100%', marginTop: 14, padding: '16px', borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: allReq ? 'pointer' : 'not-allowed',
          border: 'none', background: allReq ? 'var(--amber)' : 'var(--surface-2)', color: allReq ? '#1a1206' : 'var(--fg-3)', opacity: pending ? 0.6 : 1 }}>
        {pending ? '…' : allReq ? "🚀 I'm ready for dispatch" : 'Check the required items first'}
      </button>
      {!allReq && <div className="muted" style={{ fontSize: 11.5, marginTop: 6, textAlign: 'center' }}>Required: {required.filter((k) => !checks[k]).length} left. (Emergency dispatch isn’t blocked.)</div>}
      <button onClick={() => persist(false)} disabled={pending} style={{ width: '100%', marginTop: 8, padding: '10px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--fg-2)', fontSize: 13, cursor: 'pointer' }}>Save progress</button>
      {msg && <div style={{ fontSize: 12.5, marginTop: 8, textAlign: 'center', color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </div>
  );
}

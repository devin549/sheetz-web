'use client';

// The Job Cockpit spine — a 7-step workflow rail (Rolling → Arrived → Diagnose → Present → Pay →
// Photos → Done) with ONE prominent Next Action. This is the loop a tech runs all day, so it's built
// to feel good: clear progress, a single obvious next tap, and a celebration when the job closes.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setJobStatus } from './actions';
import { Truck, MapPin, Stethoscope, FileText, CreditCard, Camera, CircleCheck, ChevronDown } from 'lucide-react';

const STEPS = [
  { key: 'rolling', label: 'Rolling', icon: Truck },
  { key: 'arrived', label: 'Arrived', icon: MapPin },
  { key: 'diagnose', label: 'Diagnose', icon: Stethoscope },
  { key: 'present', label: 'Present', icon: FileText },
  { key: 'pay', label: 'Pay', icon: CreditCard },
  { key: 'photos', label: 'Photos', icon: Camera },
  { key: 'done', label: 'Done', icon: CircleCheck },
];

function scrollTo(id) { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

export default function JobFlow({ jobId, status, reached, gateReady, gateMissing = [], nextHint, canAct }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const isDone = status === 'done';
  const currentIdx = STEPS.findIndex((s) => !reached[s.key]);

  const advance = (to) => { setMsg(null); start(async () => { const r = await setJobStatus(jobId, to); setMsg(r); if (r?.ok) router.refresh(); }); };

  // ONE next action, derived from where the job is.
  let cta = null;
  if (!isDone && canAct) {
    if (status === 'scheduled' || (!reached.rolling)) cta = { label: '🚚 Start driving', onClick: () => advance('enroute'), primary: true };
    else if (status === 'enroute' || !reached.arrived) cta = { label: '📍 I’ve arrived', onClick: () => advance('on_site'), primary: true };
    else if (gateReady) cta = { label: '✅ Complete job', onClick: () => advance('done'), primary: true };
    else cta = { label: nextHint ? `Next: ${nextHint}` : 'Finish closeout below', onClick: () => scrollTo('closeout-gate'), primary: false };
  }

  return (
    <div className="card card-amber" style={{ marginTop: 12 }}>
      {/* progress rail */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
        {STEPS.map((s, i) => {
          const done = reached[s.key];
          const current = i === currentIdx && !isDone;
          const I = s.icon;
          const color = done ? 'var(--green)' : current ? 'var(--amber)' : 'var(--fg-3)';
          return (
            <div key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, position: 'relative' }}>
              {i < STEPS.length - 1 && (
                <div style={{ position: 'absolute', top: 15, left: '50%', right: '-50%', height: 2, background: done ? 'var(--green)' : 'var(--border)', zIndex: 0 }} />
              )}
              <div style={{ zIndex: 1, width: 32, height: 32, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? 'color-mix(in oklab, var(--green) 22%, var(--surface-1))' : current ? 'color-mix(in oklab, var(--amber) 22%, var(--surface-1))' : 'var(--surface-2)',
                border: `2px solid ${color}` }}>
                {done ? <CircleCheck size={17} style={{ color: 'var(--green)' }} /> : <I size={15} style={{ color }} />}
              </div>
              <div style={{ fontSize: 9.5, fontWeight: current ? 800 : 600, color, marginTop: 4, textAlign: 'center', lineHeight: 1.1 }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* one next action */}
      {cta && (
        <button onClick={cta.onClick} disabled={pending}
          style={{ width: '100%', marginTop: 14, padding: '15px', borderRadius: 12, fontWeight: 800, fontSize: 16, cursor: 'pointer',
            border: cta.primary ? 'none' : '1px solid var(--amber-dim)',
            background: cta.primary ? 'var(--amber)' : 'rgba(255,179,0,.10)', color: cta.primary ? '#1a1206' : 'var(--amber)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pending ? 0.6 : 1 }}>
          {pending ? '…' : cta.label}{!cta.primary && <ChevronDown size={16} />}
        </button>
      )}
      {isDone && (
        <div style={{ marginTop: 14, padding: '14px', borderRadius: 12, background: 'color-mix(in oklab, var(--green) 14%, transparent)', border: '1px solid var(--green)', textAlign: 'center', fontWeight: 800, color: 'var(--green)' }}>
          🎉 Job complete — nice work.
        </div>
      )}
      {!gateReady && !isDone && reached.arrived && gateMissing.length > 0 && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8, textAlign: 'center' }}>To close: {gateMissing.join(', ')}.</div>
      )}
      {msg && !msg.ok && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8, textAlign: 'center' }}>{msg.msg}</div>}
    </div>
  );
}

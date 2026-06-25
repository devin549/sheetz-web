'use client';

// Office "Correction needed / QA Hold" queue. Each card shows the FAILED photo with the supervisor's
// circle + reason + note, and the office actions: book a correction visit, log customer-contacted,
// resolve. Never auto-texts the customer — "contacted" is a human-logged action.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { scheduleCorrectionVisit, markCustomerContacted, resolveCorrection } from '../job/[id]/actions';
import { FAIL_LABEL } from '@/lib/qa';
import { CircleAlert, CalendarPlus, Phone, CheckCircle2 } from 'lucide-react';

export default function CorrectionsList({ items }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  if (!items.length) return <div className="card"><span className="muted">No open corrections. 🎉</span></div>;

  const act = (id, fn) => { setBusy(id); setMsg(null); start(async () => { const r = await fn(); setBusy(null); setMsg(r); if (r?.ok) router.refresh(); }); };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {msg && <div className={msg.ok ? 'card' : 'notice'} style={msg.ok ? { borderColor: 'var(--green)' } : undefined}><span style={{ color: msg.ok ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>{msg.ok ? 'Done' : 'Error'}</span><span className="muted"> — {msg.msg}</span></div>}
      {items.map((c) => (
        <div key={c.id} className="card" style={{ borderLeft: '3px solid var(--red)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {/* failed photo + circle */}
          <div style={{ position: 'relative', width: 160, flexShrink: 0 }}>
            {c.signedUrl ? <img src={c.signedUrl} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8, display: 'block', background: 'var(--surface-2)' }} />
              : <div className="muted" style={{ width: '100%', aspectRatio: '4/3', display: 'grid', placeItems: 'center', background: 'var(--surface-2)', borderRadius: 8 }}>no preview</div>}
            {(c.annotations || []).map((a) => (
              <span key={a.id} style={{ position: 'absolute', left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${(a.w || 0.13) * 100}%`, aspectRatio: '1', transform: 'translate(-50%,-50%)', border: '3px solid #ff5252', borderRadius: '50%', pointerEvents: 'none' }} />
            ))}
            <span style={{ position: 'absolute', top: 5, left: 5, background: '#ff5252', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 7 }}>QA HOLD</span>
          </div>
          {/* detail + actions */}
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <CircleAlert size={15} style={{ color: 'var(--red)' }} />
              <span style={{ fontWeight: 800, color: 'var(--red)' }}>{FAIL_LABEL[c.fail_reason] || 'Failed photo'}</span>
              <Link href={`/job/${c.orig_job_id}`} className="pill" style={{ marginLeft: 'auto' }}>{c.customerName || 'Open job'} →</Link>
            </div>
            {c.manager_note && <div className="muted" style={{ fontSize: 12.5, marginTop: 6, fontStyle: 'italic' }}>“{c.manager_note}”</div>}
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Opened by {c.created_by_name || '—'}{c.customer_contacted ? ' · ✓ customer contacted' : ''}{c.correction_job_id ? ' · ✓ visit booked' : ''}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <button disabled={pending || !!c.correction_job_id} onClick={() => act(c.id, () => scheduleCorrectionVisit(c.id))} className="pill" style={{ cursor: 'pointer', border: '1px solid var(--amber-dim)', color: 'var(--amber)', opacity: c.correction_job_id ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}><CalendarPlus size={13} /> Create correction visit</button>
              <button disabled={pending || c.customer_contacted} onClick={() => act(c.id, () => markCustomerContacted(c.id))} className="pill" style={{ cursor: 'pointer', border: '1px solid var(--border-strong)', opacity: c.customer_contacted ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={13} /> Customer contacted</button>
              <button disabled={pending} onClick={() => act(c.id, () => resolveCorrection(c.id))} className="pill" style={{ cursor: 'pointer', border: '1px solid var(--green)', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={13} /> Resolve</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

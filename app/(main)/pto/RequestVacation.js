'use client';

// Request time off — routes to the Field Supervisor for approval (never auto-approved, per CB policy).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { requestTimeOff } from './actions';
import { noticeDays, SHORT_NOTICE_DAYS } from '@/lib/techAvailability';

// CB offers no sick PTO — sick days are handled as excused absences (with a doctor's note). Planned
// time off is vacation / personal / unpaid only.
const KINDS = [['vacation', '🏖 Vacation'], ['personal', '🙋 Personal'], ['unpaid', '💸 Unpaid']];
const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 12px', fontSize: 14 };

export default function RequestVacation() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('vacation');
  const [startDate, setStartDate] = useState('');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const nd = noticeDays(startDate);
  const shortNotice = nd != null && nd >= 0 && nd < SHORT_NOTICE_DAYS;

  const submit = (form) => { setMsg(null); start(async () => { const r = await requestTimeOff(form); setMsg(r); if (r.ok) { setOpen(false); setStartDate(''); router.refresh(); } }); };

  return (
    <>
      <button onClick={() => setOpen(true)} style={{ width: '100%', background: 'var(--amber-dim)', color: '#000', border: 'none', padding: '14px', borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>+ Request time off</button>
      {msg && !open && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
          <form action={submit} onClick={(e) => e.stopPropagation()} className="card card-amber" style={{ maxWidth: 400, width: '100%', display: 'grid', gap: 10 }}>
            <div className="h1" style={{ fontSize: 18, margin: 0 }}>📅 Request time off</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {KINDS.map(([k, l]) => (
                <button type="button" key={k} onClick={() => setKind(k)} style={{ fontSize: 12, fontWeight: 700, padding: '7px 11px', borderRadius: 20, cursor: 'pointer', border: '1px solid ' + (kind === k ? 'var(--amber)' : 'var(--border-strong)'), background: kind === k ? 'var(--amber)' : 'var(--surface-2)', color: kind === k ? '#1a1206' : 'var(--fg-2)' }}>{l}</button>
              ))}
            </div>
            <input type="hidden" name="kind" value={kind} />
            <label className="muted" style={{ fontSize: 11 }}>From<input type="date" name="start_date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ ...inp, marginTop: 3 }} /></label>
            <label className="muted" style={{ fontSize: 11 }}>To (optional)<input type="date" name="end_date" style={{ ...inp, marginTop: 3 }} /></label>
            <textarea name="reason" rows={2} placeholder="Reason (optional)" style={{ ...inp, resize: 'vertical' }} />
            {shortNotice && <div style={{ fontSize: 11, color: 'var(--amber)', background: 'rgba(255,179,0,0.08)', border: '1px solid var(--amber-dim)', borderRadius: 8, padding: '7px 10px' }}>⚠ Heads up — that’s only <strong>{nd} day{nd === 1 ? '' : 's'}</strong> away. CB asks for <strong>at least 2 weeks notice</strong> when possible. You can still send it; your supervisor will see it’s short notice.</div>}
            <div className="muted" style={{ fontSize: 11 }}>Routes to your Field Supervisor — never auto-approved. Blocks you off the schedule once approved. Paid types draw from your hourly balance.</div>
            {msg && !msg.ok && <div style={{ color: 'var(--red)', fontSize: 12 }}>{msg.msg}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send request →'}</button>
              <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

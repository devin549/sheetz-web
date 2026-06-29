'use client';

// End-of-job decision: BILL OUT or ROLL OVER. Lives at the BOTTOM of the cockpit (Devin) — by the time a
// tech is deciding this, the work's done: either finish billing (Build/Send the estimate → invoice) or roll
// the job to another day (same job, parts & history kept). Open that day → auto-rolls; booked → office finds
// a day & calls the customer.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { rollOverJob } from './actions';

export default function RollOverCard({ jobId, canAct = true }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  if (!canAct) return null;

  const roll = () => { setMsg(null); start(async () => { const r = await rollOverJob(jobId, { reason: reason.trim(), returnDate: date }); setMsg(r); if (r?.ok) { setConfirm(false); setReason(''); setDate(''); router.refresh(); } }); };
  const chip = { padding: '8px 13px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: 'var(--surface-2)', border: '1px solid var(--amber-dim)', color: 'var(--amber)' };

  return (
    <div className="card" style={{ marginTop: 10, borderLeft: '3px solid var(--amber-dim)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>🏁</span>
        <div style={{ fontWeight: 800 }}>Finish up — bill out or roll over</div>
      </div>
      {!confirm ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Link href={`/job/${jobId}/pricebook`} className="btn btn-primary" style={{ textDecoration: 'none' }}>🧾 Bill it out</Link>
          <span className="muted" style={{ fontSize: 11.5, flex: 1, minWidth: 130 }}>Done on site? Build &amp; send the estimate/invoice. Can&apos;t finish today? Roll it to another day — same job, parts &amp; history kept.</span>
          <button onClick={() => setConfirm(true)} disabled={pending} style={chip}>🔁 Roll over</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 7 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>🔁 Roll this job — why can&apos;t it finish today?</div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason — e.g. waiting on a part, ran out of daylight" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '8px 10px', fontSize: 12.5 }} />
          <label style={{ fontSize: 11, color: 'var(--fg-3)' }}>Estimated return date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ display: 'block', marginTop: 3, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '7px 9px', fontSize: 12.5 }} /></label>
          <div className="muted" style={{ fontSize: 10.5 }}>If you&apos;re open that day it auto-rolls to your schedule. If you&apos;re booked, the office finds a day &amp; calls the customer.</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={roll} disabled={pending || !reason.trim()} style={{ ...chip, borderColor: 'var(--amber)', opacity: !reason.trim() ? 0.5 : 1 }}>{pending ? '…' : '🔁 Roll it'}</button>
            <button onClick={() => setConfirm(false)} style={{ ...chip, color: 'var(--fg-3)', borderColor: 'var(--border)' }}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <div style={{ fontSize: 12, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </div>
  );
}

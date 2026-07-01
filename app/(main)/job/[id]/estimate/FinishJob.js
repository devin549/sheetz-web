'use client';

// 🏁 The LAST step of the close flow — lives at the BOTTOM of the Quote tab, right where the tech just
// finished collecting, signing, and emailing. Before this they had to bounce back to Overview to close the
// ticket (and some guys "forgot" — open ticket = no next dispatch). DONE is now one tap from the email
// button; the geofence leave-without-closing alert stays as the backstop for the ones who still skip it.
// setJobStatus('done') enforces the closeout gate server-side — photos/QA/forms must pass or it bounces
// with exactly what's missing.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { setJobStatus, rollOverJob } from '../actions';

export default function FinishJob({ jobId, isDone = false, canAct = true }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  if (!canAct) return null;

  if (isDone) {
    return (
      <div className="card" style={{ marginTop: 10, borderLeft: '3px solid var(--green)' }}>
        <div style={{ fontWeight: 800, color: 'var(--green)', fontSize: 14 }}>🏁 Job closed — nice work.</div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>Ticket’s off your board. Head to <Link href="/my-day" style={{ color: 'var(--amber)' }}>My Day</Link> for the next one.</div>
      </div>
    );
  }

  const done = () => { setMsg(null); start(async () => { const r = await setJobStatus(jobId, 'done'); setMsg(r); if (r?.ok) router.refresh(); }); };
  const roll = () => { setMsg(null); start(async () => { const r = await rollOverJob(jobId, { reason: reason.trim(), returnDate: date }); setMsg(r); if (r?.ok) { setRolling(false); setReason(''); setDate(''); router.refresh(); } }); };
  const chip = { padding: '8px 13px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: 'var(--surface-2)', border: '1px solid var(--amber-dim)', color: 'var(--amber)' };

  return (
    <div className="card" style={{ marginTop: 10, borderLeft: '3px solid var(--green)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>🏁</span>
        <div style={{ fontWeight: 800 }}>Finish the job</div>
      </div>
      {!rolling ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={done} disabled={pending} className="btn" style={{ flex: '1 1 180px', fontWeight: 800, opacity: pending ? 0.6 : 1 }}>{pending ? '…' : '✓ Mark job DONE'}</button>
          <button onClick={() => setRolling(true)} disabled={pending} style={chip}>🔁 Roll over</button>
          <div className="muted" style={{ fontSize: 11, flexBasis: '100%' }}>Collected, signed, emailed? Close it out — an open ticket keeps you off the next dispatch.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 7 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>🔁 Roll this job — why can&apos;t it finish today?</div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason — e.g. waiting on a part, ran out of daylight" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '8px 10px', fontSize: 12.5 }} />
          <label style={{ fontSize: 11, color: 'var(--fg-3)' }}>Estimated return date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ display: 'block', marginTop: 3, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '7px 9px', fontSize: 12.5 }} /></label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={roll} disabled={pending || !reason.trim()} style={{ ...chip, borderColor: 'var(--amber)', opacity: !reason.trim() ? 0.5 : 1 }}>{pending ? '…' : '🔁 Roll it'}</button>
            <button onClick={() => setRolling(false)} style={{ ...chip, color: 'var(--fg-3)', borderColor: 'var(--border)' }}>Cancel</button>
          </div>
        </div>
      )}
      {msg && !msg.ok && (
        <div style={{ fontSize: 12, marginTop: 8, color: 'var(--red)', fontWeight: 700 }}>
          {msg.msg}{msg.blocked === 'closeout' && <> — <Link href={`/job/${jobId}/photos`} style={{ color: 'var(--amber)' }}>fix it on Photos →</Link></>}
        </div>
      )}
      {msg && msg.ok && <div style={{ fontSize: 12, marginTop: 8, color: 'var(--green)', fontWeight: 700 }}>{msg.msg || 'Done.'}</div>}
    </div>
  );
}

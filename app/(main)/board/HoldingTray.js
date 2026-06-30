'use client';

// 🚨 Holding tray — jobs that lost their tech (a sick pull or an unassign) but still have a time, so they
// need re-covering TODAY. For each, we suggest the best available tech (lightest load, working that day,
// anyone off is already excluded) and let the office assign in one tap. If no one's free, it says so —
// that's the office's cue to reschedule or call the customer.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assignTech } from './actions';

const fmtT = (iso) => { try { return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

function HeldCard({ job, canAssign }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState(null);
  const assign = (techId) => { setErr(null); setBusyId(techId); start(async () => { const r = await assignTech(job.id, techId, job.scheduledISO); setBusyId(null); if (r.ok) router.refresh(); else setErr(r.msg || 'Could not assign.'); }); };
  const top = job.suggestions && job.suggestions[0];
  const alts = (job.suggestions || []).slice(1, 3);
  return (
    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-1)', border: '1px solid var(--amber-dim)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>{job.job_number ? `#${job.job_number} ` : ''}{job.customer}</strong>
        <span className="muted" style={{ fontSize: 11.5 }}>{job.scheduledISO ? fmtT(job.scheduledISO) : 'no time'}{job.address ? ` · ${job.address}` : ''}{job.job_type ? ` · ${job.job_type}` : ''}</span>
      </div>
      {!canAssign ? (
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Needs a tech — ask dispatch to reassign.</div>
      ) : top ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5 }}>👉 Best fit: <strong style={{ color: 'var(--amber)' }}>{top.name}</strong> <span className="muted">({top.load} job{top.load === 1 ? '' : 's'} today{top.reasons && top.reasons.length ? ` · ${top.reasons.join(', ')}` : ' · lightest load'})</span></span>
          <button onClick={() => assign(top.id)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--green)', border: '1px solid var(--green)', fontWeight: 700 }}>{busyId === top.id ? '…' : `✓ Assign ${top.name.split(' ')[0]}`}</button>
          {alts.map((a) => (
            <button key={a.id} onClick={() => assign(a.id)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--fg-2)', border: '1px solid var(--border-strong)' }} title={`${a.load} jobs today`}>{busyId === a.id ? '…' : a.name.split(' ')[0]}</button>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, marginTop: 8, color: 'var(--red)' }}>⚠ No one free at this time — reschedule or call the customer{job.phone ? ` (${job.phone})` : ''}.</div>
      )}
      {err && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 5 }}>{err}</div>}
    </div>
  );
}

export default function HoldingTray({ jobs = [], canAssign = false }) {
  if (!jobs.length) return null;
  return (
    <div className="card" style={{ marginTop: 12, marginBottom: 12, borderLeft: '3px solid var(--amber)', background: 'color-mix(in oklab, var(--amber) 6%, var(--surface-1))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>🚨</span>
        <strong style={{ fontSize: 13.5 }}>Holding tray — {jobs.length} job{jobs.length === 1 ? '' : 's'} need re-covering</strong>
        <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>tech out / unassigned · AI picks the best available</span>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {jobs.map((j) => <HeldCard key={j.id} job={j} canAssign={canAssign} />)}
      </div>
    </div>
  );
}

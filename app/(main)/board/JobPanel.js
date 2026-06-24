'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateJobStatus, assignTech } from './actions';
import { priorityOf, fmtTime, statusKey } from './boardTokens';

// Status banners — exact colors from the live board (dispatchboard_panel.html JP_BANNERS).
const BANNERS = {
  late: { bg: 'rgba(255,46,61,0.15)', bd: '#ff2e3d', fg: '#ff8a80', icon: '🔴', text: 'Late — tech is running behind' },
  onsite: { bg: 'rgba(46,125,50,0.16)', bd: '#66bb6a', fg: '#a5d6a7', icon: '🏠', text: 'On site' },
  enroute: { bg: 'rgba(33,150,243,0.15)', bd: '#64b5f6', fg: '#90caf9', icon: '🚗', text: 'En route' },
  done: { bg: 'var(--surface-2)', bd: 'var(--border-strong)', fg: 'var(--fg-3)', icon: '✓', text: 'Completed' },
  hold: { bg: 'rgba(255,179,0,0.12)', bd: '#e0a800', fg: '#e0a800', icon: '⏸', text: 'On hold' },
  scheduled: { bg: 'rgba(255,107,0,0.10)', bd: 'var(--accent)', fg: 'var(--accent)', icon: '🗓', text: 'Scheduled' },
};

const Chip = ({ children, style }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'var(--fg-2)', whiteSpace: 'nowrap', ...style }}>{children}</span>
);
const Section = ({ label, children }) => (
  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
    <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 6 }}>{label}</div>
    {children}
  </div>
);
const KV = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
    <span style={{ color: 'var(--fg-3)' }}>{k}</span><span style={{ color: 'var(--fg-1)' }}>{v}</span>
  </div>
);
const btnGhost = { padding: '7px 12px', fontSize: 12, background: 'var(--bg)', color: 'var(--fg-2)', border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' };
const btnPrimary = { ...btnGhost, flex: 1, textAlign: 'center', background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', fontWeight: 800 };

export default function JobPanel({ job, techName, techs = [], canStatus, canAssign, onClose }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);
  if (!job) return null;

  const sk = statusKey(job.status);
  const b = BANNERS[sk] || BANNERS.scheduled;
  const pr = priorityOf(job.priority);
  const tel = String(job.phone || '').replace(/[^0-9+]/g, '');
  const ticket = Number(job.amount) || 0;
  const startStr = job.scheduledISO ? (() => { try { return new Date(job.scheduledISO).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return '—'; } })() : '—';
  const openMap = () => { if (job.address) window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(job.address), '_blank'); };

  const act = (fn) => start(async () => { const res = await fn(); if (res && !res.ok) setErr(res.msg); else { setErr(null); router.refresh(); onClose(); } });
  const setStatus = (s) => act(() => updateJobStatus(job.id, s));
  const unassign = () => act(() => assignTech(job.id, null));
  // Reassign to another tech, keeping the same scheduled time.
  const reassign = (techId) => act(() => assignTech(job.id, techId || null, job.scheduledISO || undefined));

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 360, maxWidth: '92vw', background: 'var(--surface-1)', borderLeft: '1px solid var(--border)', zIndex: 1001, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 30px rgba(0,0,0,0.3)' }}>
        {/* status banner */}
        <div style={{ padding: '10px 14px', background: b.bg, borderBottom: '1px solid ' + b.bd, color: b.fg, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{b.icon}</span><span style={{ flex: 1 }}>{b.text}</span>
          <button onClick={onClose} title="Close" style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>

        {/* title + chips */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 800, flex: 1, lineHeight: 1.2 }}>{job.job_type || 'Service call'}</div>
            {job.job_number && <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--fg-3)' }}>#{job.job_number}</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            <Chip>🕐 {fmtTime(job.scheduledISO)}</Chip>
            <Chip style={techName ? { background: 'color-mix(in oklab, var(--accent) 16%, var(--surface-2))', color: 'var(--accent)', borderColor: 'var(--accent)' } : { color: 'var(--fg-3)' }}>{techName || 'Unassigned'}</Chip>
            {pr && <Chip style={{ color: pr.color, borderColor: pr.color }}>{pr.short}</Chip>}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          <Section label="Assignment">
            <KV k="Assigned to" v={techName || 'Unassigned'} />
            {canAssign && (
              <>
                <div style={{ fontSize: 10, color: 'var(--fg-3)', margin: '8px 0 4px' }}>Reassign to a tech</div>
                <select value={job.techId || ''} onChange={(e) => reassign(e.target.value)} disabled={pending}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, background: 'var(--surface-2)', color: 'var(--fg-1)', border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer' }}>
                  <option value="">— Unassigned (queue) —</option>
                  {techs.map((t) => <option key={t.id} value={t.id}>{t.name}{t.crew ? ` · ${t.crew}` : ''}</option>)}
                </select>
                {techName && <button onClick={unassign} disabled={pending} style={{ ...btnGhost, marginTop: 6 }}>Send to queue</button>}
              </>
            )}
          </Section>

          <Section label="Customer">
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{job.customer || 'Customer'}</div>
            {job.phone && <a href={'tel:' + tel} style={{ display: 'block', fontSize: 12, color: '#64b5f6', marginTop: 4 }}>📞 {job.phone}</a>}
            {job.address && <div onClick={openMap} title="Open in Maps" style={{ fontSize: 12, color: '#64b5f6', cursor: 'pointer', marginTop: 4, lineHeight: 1.4 }}>📍 {job.address}</div>}
          </Section>

          {(job.mustTell || job.promise || job.access || job.scope || job.csr) && (
            <Section label="Dispatch handoff">
              {job.mustTell && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', background: 'color-mix(in oklab, var(--red) 12%, transparent)', borderRadius: 6, padding: '6px 8px', marginBottom: 6 }}>🚨 {job.mustTell}</div>}
              {job.promise && <div style={{ fontSize: 12, marginTop: 2 }}><span className="muted">Promise: </span>{job.promise}</div>}
              {job.access && <div style={{ fontSize: 12, marginTop: 2 }}><span className="muted">Access: </span>{job.access}</div>}
              {job.scope && <div style={{ fontSize: 12, marginTop: 2 }}><span className="muted">Sold scope: </span>{job.scope}</div>}
              {job.csr && <div style={{ fontSize: 12, marginTop: 2 }}><span className="muted">Booked by: </span>{job.csr}</div>}
            </Section>
          )}

          <Section label="Schedule"><KV k="Start" v={startStr} /></Section>

          <Section label="Job file">
            <Link href={`/job/${job.id}`} style={{ ...btnGhost, display: 'block', textAlign: 'center' }}>
              Open photos / work order
            </Link>
          </Section>

          {job.closeout && job.closeout.available !== false && (
            <Section label="Closeout status">
              {[
                ['Photos', `${job.closeout.photoCount}/${job.closeout.minPhotos}`, job.closeout.photoCount >= job.closeout.minPhotos, false],
                ...(job.closeout.requireVideo ? [['Walkthrough video', job.closeout.haveVideo ? '1/1' : '0/1', job.closeout.haveVideo, false]] : []),
                ['QA review', ({ pass: 'Passed', fail: 'Failed', partial: 'In review', pending: 'Not reviewed' })[job.closeout.qaState] || '—', job.closeout.qaState === 'pass', job.closeout.qaState === 'fail'],
              ].map(([k, v, ok, warn]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '2px 0' }}>
                  <span style={{ color: 'var(--fg-3)' }}>{k}</span>
                  <span style={{ color: warn ? 'var(--red)' : ok ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>{v}{ok && !warn ? ' ✓' : ''}</span>
                </div>
              ))}
              <div style={{ marginTop: 6 }}>
                <span className="pill" style={{ fontSize: 11, fontWeight: 800, background: job.closeout.readyToClose ? 'rgba(70,193,120,.16)' : 'rgba(255,179,0,.14)', color: job.closeout.readyToClose ? 'var(--green)' : 'var(--amber)' }}>{sk === 'done' ? 'Closed' : job.closeout.readyToClose ? 'Ready to close' : 'Blocked'}</span>
                {!job.closeout.readyToClose && job.closeout.missing?.length > 0 && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Needs: {job.closeout.missing.join(', ')}</div>}
              </div>
            </Section>
          )}

          <Section label="Billing">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Invoice subtotal</span>
              <span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: ticket > 0 ? 'var(--fg-1)' : 'var(--fg-3)' }}>${ticket.toLocaleString()}</span>
            </div>
          </Section>

          {err && <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--red)' }}>{err}</div>}
        </div>

        {/* action bar */}
        {canStatus && (
          <div style={{ borderTop: '1px solid var(--border)', padding: 10, display: 'flex', gap: 6 }}>
            {sk !== 'enroute' && sk !== 'done' && <button onClick={() => setStatus('enroute')} disabled={pending} style={btnPrimary}>Mark en route</button>}
            {sk !== 'onsite' && sk !== 'done' && <button onClick={() => setStatus('on_site')} disabled={pending} style={btnGhost}>On site</button>}
            {sk !== 'done' && <button onClick={() => setStatus('done')} disabled={pending} style={btnGhost}>Complete</button>}
            {sk === 'done' && <span className="muted" style={{ fontSize: 12, padding: '7px 4px' }}>✓ Completed</span>}
          </div>
        )}
      </div>
    </>
  );
}

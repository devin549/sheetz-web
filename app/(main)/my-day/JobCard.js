'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateMyJobStatus } from './actions';

function fmtTime(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return '—'; } }
function money(n) { return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function dial(raw) { const d = String(raw || '').replace(/[^\d]/g, ''); if (d.length === 10) return '+1' + d; if (d.length === 11 && d[0] === '1') return '+' + d; return d ? '+' + d : ''; }
function statusPill(status) {
  const s = String(status || '').toLowerCase();
  if (/done|complete|closed/.test(s)) return { label: '✓ COMPLETE', cls: 'pill pill-green' };
  if (/on_site|onsite/.test(s)) return { label: '📍 ON-SITE', cls: 'pill', color: 'var(--amber)' };
  if (/enroute|en route|rolling/.test(s)) return { label: '🚚 EN ROUTE', cls: 'pill', color: 'var(--amber)' };
  if (/cancel/.test(s)) return { label: 'CANCELLED', cls: 'pill', color: 'var(--fg-3)' };
  return { label: (status || 'scheduled').toUpperCase(), cls: 'pill' };
}

// Big touch-friendly step buttons — the field workflow the iPad exists for.
const STEPS = [
  { key: 'enroute', label: '🚚 En route' },
  { key: 'on_site', label: '📍 On site' },
  { key: 'done', label: '✓ Complete' },
];
const btn = (active, done) => ({
  flex: 1, padding: '12px 8px', borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: 'pointer',
  border: '1px solid ' + (active ? 'var(--amber)' : 'var(--border-strong)'),
  background: active ? 'var(--amber)' : 'var(--surface-2)', color: active ? '#1a1206' : 'var(--fg-2)',
  opacity: done ? 0.5 : 1, whiteSpace: 'nowrap',
});

export default function JobCard({ job, seeAll, canAct }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyKey, setBusyKey] = useState(null);
  const [err, setErr] = useState(null);

  const cust = job.customers || {};
  const t = job.techs || {};
  const s = String(job.status || '').toLowerCase();
  const done = /done|complete|closed/.test(s);
  const cancelled = /cancel/.test(s);
  const cur = /on_site|onsite/.test(s) ? 'on_site' : /enroute|rolling/.test(s) ? 'enroute' : done ? 'done' : 'scheduled';
  const urgent = /high|urgent|emergency/i.test(String(job.priority || ''));
  const pill = statusPill(job.status);
  const typeBits = [job.job_type, job.amount ? money(job.amount) : null].filter(Boolean).join(' · ');
  const tel = dial(cust.phone);
  const mapHref = cust.address ? `https://maps.google.com/?q=${encodeURIComponent(cust.address)}` : null;

  const setStatus = (key) => { setBusyKey(key); setErr(null); start(async () => { const r = await updateMyJobStatus(job.id, key); setBusyKey(null); if (r && !r.ok) setErr(r.msg); else router.refresh(); }); };

  return (
    <div className="card card-amber" style={{ opacity: done || cancelled ? 0.72 : 1 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'start' }}>
        <div style={{ textAlign: 'center', minWidth: 52 }}>
          <div style={{ fontWeight: 800, color: 'var(--amber)', fontSize: 14 }}>{fmtTime(job.scheduled_at)}</div>
          {job.job_number && <div className="muted" style={{ fontSize: 10, fontFamily: 'monospace' }}>#{job.job_number}</div>}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {urgent && <span className="alert-dot" aria-hidden="true" />}
            {cust.name || 'Customer'}
            {urgent && <span className="pill pill-red pill-blink" style={{ marginLeft: 8 }}>RUNNING LATE</span>}
          </div>
          {cust.address && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>📍 {cust.address}</div>}
          {typeBits && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>🔧 {typeBits}</div>}
          {seeAll && t.name && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>👷 {t.name}</div>}
          <div style={{ marginTop: 8 }}>
            <Link href={`/job/${job.id}`} className="pill" style={{ color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>📷 Job file / photos</Link>
          </div>
        </div>
        <span className={pill.cls} style={pill.color ? { color: pill.color } : undefined}>{pill.label}</span>
      </div>

      {/* quick links */}
      {(mapHref || tel) && !cancelled && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {mapHref && <a href={mapHref} target="_blank" rel="noopener" style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>🧭 Navigate</a>}
          {tel && <a href={`tel:${tel}`} style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>📞 Call</a>}
        </div>
      )}

      {/* status workflow */}
      {canAct && !cancelled && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {STEPS.map((st) => (
            <button key={st.key} onClick={() => setStatus(st.key)} disabled={pending} style={btn(cur === st.key, done && st.key !== 'done')}>
              {pending && busyKey === st.key ? '…' : st.label}
            </button>
          ))}
        </div>
      )}
      {err && <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 6 }}>{err}</div>}
    </div>
  );
}

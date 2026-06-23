'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateMyJobStatus, reportEta } from './actions';

const ETA_CHIPS = [15, 30, 45, 60];

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
  const [lateOpen, setLateOpen] = useState(false);
  const [etaMins, setEtaMins] = useState(30);
  const [etaNote, setEtaNote] = useState('');
  const [lateMsg, setLateMsg] = useState(null);

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

  // Report a delay to the OFFICE — never to the customer. new ETA is computed in the browser.
  const sendEta = (needsHelp) => {
    setLateMsg(null);
    const mins = needsHelp ? 0 : etaMins;
    const newEtaISO = needsHelp ? null : new Date(Date.now() + mins * 60000).toISOString();
    start(async () => {
      const r = await reportEta(job.id, mins, etaNote, needsHelp, newEtaISO);
      setLateMsg(r);
      if (r?.ok) { setEtaNote(''); if (!needsHelp) setLateOpen(false); router.refresh(); }
    });
  };
  const newEtaLabel = fmtTime(new Date(Date.now() + etaMins * 60000).toISOString());

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

      {/* Running Late — tech reports a delay; the OFFICE handles the customer message. */}
      {canAct && !cancelled && !done && (
        <div style={{ marginTop: 8 }}>
          {!lateOpen ? (
            <button onClick={() => { setLateOpen(true); setLateMsg(null); }}
              style={{ width: '100%', padding: '11px', borderRadius: 10, border: '1px solid var(--amber-dim)', background: 'rgba(255,129,36,.10)', color: 'var(--amber)', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              ⏱ Running late
            </button>
          ) : (
            <div style={{ border: '1px solid var(--amber-dim)', borderRadius: 10, padding: 12, background: 'var(--surface-1)' }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>How much later?</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ETA_CHIPS.map((m) => (
                  <button key={m} onClick={() => setEtaMins(m)} style={{ flex: '1 1 60px', padding: '10px', borderRadius: 9, fontWeight: 800, fontSize: 14, cursor: 'pointer', border: '1px solid ' + (etaMins === m ? 'var(--amber)' : 'var(--border-strong)'), background: etaMins === m ? 'var(--amber)' : 'var(--surface-2)', color: etaMins === m ? '#1a1206' : 'var(--fg-2)' }}>+{m}m</button>
                ))}
              </div>
              <input value={etaNote} onChange={(e) => setEtaNote(e.target.value)} placeholder="Note (optional) — e.g. cable stuck, need 30 more min"
                style={{ width: '100%', marginTop: 8, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontSize: 13 }} />
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>New ETA ≈ <strong style={{ color: 'var(--fg-1)' }}>{newEtaLabel}</strong> · the office tells the customer.</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button disabled={pending} onClick={() => sendEta(false)} style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: 'var(--amber)', color: '#1a1206', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>Send update</button>
                <button disabled={pending} onClick={() => sendEta(true)} title="Ping dispatch for help" style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Need office help</button>
                <button onClick={() => { setLateOpen(false); setLateMsg(null); }} style={{ padding: '11px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-3)', cursor: 'pointer' }}>✕</button>
              </div>
            </div>
          )}
          {lateMsg && <div style={{ fontSize: 11.5, marginTop: 6, color: lateMsg.ok ? 'var(--green)' : 'var(--red)' }}>{lateMsg.msg}</div>}
        </div>
      )}
    </div>
  );
}

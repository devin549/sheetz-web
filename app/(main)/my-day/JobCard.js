'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateMyJobStatus, reportEta, createJobPayLink } from './actions';
import PersonCard from '@/components/PersonCard';
import { TAG_COLOR } from '@/lib/jobTags';

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

// Max 4 high-signal tags, then "+N more"; tap a tag to learn why it matters. Color-coded by type.
function TagRow({ tags = [] }) {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(null);
  if (!tags.length) return null;
  const show = expanded ? tags : tags.slice(0, 4);
  const more = tags.length - 4;
  return (
    <div style={{ marginTop: 7 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {show.map((tag) => { const c = TAG_COLOR[tag.tone] || TAG_COLOR.gold; return (
          <button key={tag.key} type="button" onClick={() => setOpen(open === tag.key ? null : tag.key)} title="Why it matters"
            style={{ cursor: 'pointer', fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}>{tag.label}</button>
        ); })}
        {!expanded && more > 0 && <button type="button" onClick={() => setExpanded(true)} style={{ cursor: 'pointer', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--surface-2)', color: 'var(--fg-3)', border: '1px solid var(--border)' }}>+{more} more</button>}
      </div>
      {open && <div className="muted" style={{ fontSize: 11, marginTop: 5, lineHeight: 1.4 }}>💡 {tags.find((t) => t.key === open)?.why}</div>}
    </div>
  );
}

export default function JobCard({ job, seeAll, canAct, variant = 'active', tags = [], pastDue = 0 }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyKey, setBusyKey] = useState(null);
  const [err, setErr] = useState(null);
  const [lateOpen, setLateOpen] = useState(false);
  const [etaMins, setEtaMins] = useState(30);
  const [etaNote, setEtaNote] = useState('');
  const [lateMsg, setLateMsg] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmt, setPayAmt] = useState(job.amount ? String(job.amount) : '');
  const [payLink, setPayLink] = useState(null);
  const [payErr, setPayErr] = useState(null);

  const makePayLink = () => { setPayErr(null); start(async () => { const r = await createJobPayLink(job.id, Number(payAmt)); if (r.ok) setPayLink(r); else setPayErr(r.msg); }); };

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

  const compact = variant !== 'active'; // upcoming + done = scannable, no heavy controls
  // Next required action — one line, status-derived.
  const nextAction = done ? '✓ Job complete'
    : cur === 'on_site' ? '📸 Required photos + closeout → then Complete'
    : cur === 'enroute' ? '📍 Mark On-site when you arrive'
    : '🚚 Tap En route to head out';

  // Live on-site timer (active + started).
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (variant !== 'active' || !job.started_at) return;
    const tick = () => { const ms = Date.now() - Date.parse(job.started_at); if (ms < 0) return; const m = Math.floor(ms / 60000); setElapsed(m < 60 ? `${m}m on-site` : `${Math.floor(m / 60)}h ${m % 60}m on-site`); };
    tick(); const i = setInterval(tick, 30000); return () => clearInterval(i);
  }, [variant, job.started_at]);

  return (
    <div className={variant === 'active' ? 'card card-amber' : 'card'} style={{ opacity: variant === 'done' || cancelled ? 0.6 : 1, padding: compact ? '12px 14px' : undefined }}>
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
          {seeAll && t.name && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}><PersonCard name={t.name}><span style={{ cursor: 'pointer' }}>👷 {t.name}</span></PersonCard></div>}
          <TagRow tags={tags} />
          <div style={{ marginTop: 8 }}>
            <Link href={`/job/${job.id}`} className="pill" style={{ color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>{compact ? '➡ Open job' : '📷 Job file / photos'}</Link>
          </div>
        </div>
        <span className={pill.cls} style={pill.color ? { color: pill.color } : undefined}>{pill.label}</span>
      </div>

      {/* next required action — every non-cancelled card (scannable in the driveway) */}
      {!cancelled && (
        <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: done ? 'var(--green)' : 'var(--amber)' }}>{nextAction}</div>
      )}

      {/* active status strip — timer · payment · photo proof */}
      {variant === 'active' && !cancelled && !done && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {elapsed && <span className="pill" style={{ fontSize: 11, color: 'var(--amber)' }}>⏱ {elapsed}</span>}
          <span className="pill" style={{ fontSize: 11, color: pastDue > 0 ? 'var(--red)' : 'var(--green)' }}>{pastDue > 0 ? `💸 ${money(pastDue)} due` : '💳 no balance'}</span>
          <Link href={`/job/${job.id}/photos`} className="pill" style={{ fontSize: 11, color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>📸 Proof</Link>
        </div>
      )}

      {/* quick links — active card only */}
      {variant === 'active' && (mapHref || tel) && !cancelled && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {mapHref && <a href={mapHref} target="_blank" rel="noopener" style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>🧭 Navigate</a>}
          {tel && <a href={`tel:${tel}`} style={{ flex: 1, textAlign: 'center', padding: '10px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>📞 Call</a>}
        </div>
      )}

      {/* status workflow — active card only */}
      {variant === 'active' && canAct && !cancelled && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {STEPS.map((st) => (
            <button key={st.key} onClick={() => setStatus(st.key)} disabled={pending} style={btn(cur === st.key, done && st.key !== 'done')}>
              {pending && busyKey === st.key ? '…' : st.label}
            </button>
          ))}
        </div>
      )}
      {err && <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 6 }}>{err}</div>}

      {/* Collect payment — active card only */}
      {variant === 'active' && canAct && !cancelled && (
        <div style={{ marginTop: 8 }}>
          {!payOpen ? (
            <button onClick={() => { setPayOpen(true); setPayLink(null); setPayErr(null); }}
              style={{ width: '100%', padding: '11px', borderRadius: 10, border: '1px solid #635bff', background: 'rgba(99,91,255,.10)', color: '#8a84ff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              💳 Collect payment
            </button>
          ) : (
            <div style={{ border: '1px solid #635bff', borderRadius: 10, padding: 12, background: 'var(--surface-1)' }}>
              {!payLink ? (
                <>
                  <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Amount to collect</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>$</span>
                    <input type="number" inputMode="decimal" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} placeholder="0.00"
                      style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 15 }} />
                    <button onClick={makePayLink} disabled={pending || !(Number(payAmt) > 0)} className="btn" style={{ opacity: (pending || !(Number(payAmt) > 0)) ? 0.6 : 1 }}>{pending ? '…' : 'Create link'}</button>
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Customer pays this + a 4% card fee on a secure Stripe page.</div>
                  {payErr && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{payErr}</div>}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#8a84ff', marginBottom: 6 }}>💳 Ready — customer pays {money(payLink.totalDollars)} ({money(payLink.baseDollars)} + {money(payLink.feeDollars)} fee)</div>
                  <input readOnly value={payLink.url} onFocus={(e) => e.target.select()} style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 8 }} />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {tel && <a href={`sms:${tel}?body=${encodeURIComponent('Pay your Clog Busterz Plumbing invoice here: ' + payLink.url)}`} className="btn" style={{ flex: 1, textAlign: 'center', minWidth: 120, textDecoration: 'none' }}>✉️ Text customer</a>}
                    <button onClick={() => navigator.clipboard && navigator.clipboard.writeText(payLink.url)} className="btn btn-ghost">Copy</button>
                    <a href={payLink.url} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Open ↗</a>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Running Late — active card only */}
      {variant === 'active' && canAct && !cancelled && !done && (
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

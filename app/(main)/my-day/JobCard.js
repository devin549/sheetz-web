'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateMyJobStatus, reportEta, createJobPayLink } from './actions';
import { notifyEnRoute, notifyArrived } from '../job/[id]/actions';
import PersonCard from '@/components/PersonCard';
import { TAG_COLOR } from '@/lib/jobTags';

const ETA_CHIPS = [15, 30, 45, 60];

function fmtTime(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return '—'; } }
function money(n) { return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function dial(raw) { const d = String(raw || '').replace(/[^\d]/g, ''); if (d.length === 10) return '+1' + d; if (d.length === 11 && d[0] === '1') return '+' + d; return d ? '+' + d : ''; }
// Display the real number — pre-A2P the tech calls/texts from their own phone, so show it, don't hide it.
function fmtPhone(raw) { const d = String(raw || '').replace(/\D/g, ''); const n = d.length === 11 && d[0] === '1' ? d.slice(1) : d; return n.length === 10 ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : String(raw || ''); }
function metersBetween(aLat, aLng, bLat, bLng) { const R = 6371000, rad = (d) => (d * Math.PI) / 180; const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng); const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
const ARRIVE_RADIUS_M = 150; // same geofence the shell uses to auto-quiet the ribbon at the house
function statusPill(status) {
  const s = String(status || '').toLowerCase();
  if (/done|complete|closed/.test(s)) return { label: '✓ COMPLETE', cls: 'pill pill-green' };
  // On-site chip is GREEN in the HTML (.jc-status.onsite → var(--green-bright)), not amber.
  if (/on_site|onsite/.test(s)) return { label: '📍 ON-SITE', cls: 'pill pill-green' };
  if (/enroute|en route|rolling/.test(s)) return { label: '🚚 EN ROUTE', cls: 'pill', color: 'var(--amber)' };
  if (/cancel/.test(s)) return { label: 'CANCELLED', cls: 'pill', color: 'var(--fg-3)' };
  // Scheduled = not started yet → show it as PENDING (flips to EN ROUTE → ON-SITE → COMPLETE as they go).
  if (!s || /schedul|pending/.test(s)) return { label: '⏳ PENDING', cls: 'pill', color: 'var(--fg-3)' };
  return { label: status.toUpperCase(), cls: 'pill' };
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

// Per-card launchpad — the audit's quick actions on EVERY card (Call · Text · Directions · Photos · Job).
const qb = { flex: 1, textAlign: 'center', padding: '9px 4px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontWeight: 700, fontSize: 11.5, textDecoration: 'none', display: 'block', whiteSpace: 'nowrap' };
function QuickBar({ tel, mapHref, jobId }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      {tel && <a href={`tel:${tel}`} style={qb}>📞 Call</a>}
      {tel && <a href={`sms:${tel}`} style={qb}>💬 Text</a>}
      {mapHref && <a href={mapHref} target="_blank" rel="noopener" style={qb}>🧭 Go</a>}
      <Link href={`/job/${jobId}/photos`} style={qb}>📸 Photos</Link>
      <Link href={`/job/${jobId}`} style={{ ...qb, color: 'var(--amber)', borderColor: 'var(--amber-dim)' }}>🧰 Job</Link>
    </div>
  );
}

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

export default function JobCard({ job, seeAll, canAct, variant = 'active', tags = [], pastDue = 0, next = null, etaSent = false }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyKey, setBusyKey] = useState(null);
  const [err, setErr] = useState(null);
  const [lateOpen, setLateOpen] = useState(false);
  const [etaMins, setEtaMins] = useState(30);
  const [etaNote, setEtaNote] = useState('');
  const [lateMsg, setLateMsg] = useState(null);
  const [lateAck, setLateAck] = useState(etaSent); // late-risk handled: an open ETA update already exists, or the tech just acted
  const [payOpen, setPayOpen] = useState(false);
  const [payAmt, setPayAmt] = useState(job.amount ? String(job.amount) : '');
  const [payLink, setPayLink] = useState(null);
  const [payErr, setPayErr] = useState(null);
  const [enrMsg, setEnrMsg] = useState(null);

  // 🚐 "On my way" — pings the office to text the customer your ETA. Lives on the My Day card (Devin: the
  // en-route notify belongs with the customer on My Day; once you're IN the job you're at the house).
  const notify = () => { setEnrMsg(null); start(async () => { const r = await notifyEnRoute(job.id); setEnrMsg(r); if (r?.ok) router.refresh(); }); };

  // 📍 Auto-arrival (app open): while EN ROUTE, watch GPS; when within ~150m of the job, ping the office once
  // ("GPS arrived") and show the tech an Arrive prompt. They still confirm by tapping (no false-positive
  // auto-on-site). Web limit: only works while the app is open — hands-off arrival needs the native app.
  const [atJob, setAtJob] = useState(false);
  const arrivedRef = useRef(false);

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

  // Live on-site timer (active + started) — drives the elapsed label + next-stop math.
  const [elapsed, setElapsed] = useState('');
  const [elapsedMin, setElapsedMin] = useState(0);
  useEffect(() => {
    if (variant !== 'active' || !job.started_at) return;
    const tick = () => { const ms = Date.now() - Date.parse(job.started_at); if (ms < 0) return; const m = Math.floor(ms / 60000); setElapsedMin(m); setElapsed(m < 60 ? `${m}m on-site` : `${Math.floor(m / 60)}h ${m % 60}m on-site`); };
    tick(); const i = setInterval(tick, 30000); return () => clearInterval(i);
  }, [variant, job.started_at]);
  // 📍 Geofence: while EN ROUTE to this job, watch GPS; within ~150m → ping the office once + show Arrive.
  useEffect(() => {
    if (!canAct || variant !== 'active' || cur !== 'enroute' || job.lat == null || job.lng == null) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    let alive = true, watchId = null;
    const onPos = (pos) => {
      if (!alive) return;
      const d = metersBetween(pos.coords.latitude, pos.coords.longitude, Number(job.lat), Number(job.lng));
      if (d <= ARRIVE_RADIUS_M) { setAtJob(true); if (!arrivedRef.current) { arrivedRef.current = true; notifyArrived(job.id).catch(() => {}); } }
    };
    watchId = navigator.geolocation.watchPosition(onPos, () => {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 });
    return () => { alive = false; if (watchId != null) navigator.geolocation.clearWatch(watchId); };
  }, [canAct, variant, cur, job.lat, job.lng, job.id]);
  // 🎯 Next stop: drive there + whether we'll make their window (slack). Computed from the passed leg+time.
  let nextLine = null;
  if (next && next.time && Number.isFinite(Date.parse(next.time))) {
    const driveMin = Math.round(Number(next.driveMin) || 0);
    const arriveMs = Date.now() + driveMin * 60000;
    const slack = Math.round((Date.parse(next.time) - arriveMs) / 60000);
    // "Wrap up by" = leave-by time to still make the next window = next start − drive time.
    const finishBy = fmtTime(new Date(Date.parse(next.time) - driveMin * 60000).toISOString());
    nextLine = { customer: String(next.customer || 'next stop').split(/\s+/)[0], at: fmtTime(next.time), driveMin, slack, finishBy };
  }

  // 🧭 Navigate + Notify — opens GPS directions AND marks en route + pings the office to text the ETA (1 tap).
  const navNotify = () => {
    if (mapHref && typeof window !== 'undefined') window.open(mapHref, '_blank', 'noopener');
    setEnrMsg(null);
    start(async () => { const r = await notifyEnRoute(job.id); setEnrMsg(r); if (r?.ok) router.refresh(); });
  };
  // 🚨 Late risk (next job will be late) — office relay only (never auto-texts the customer). "Text ETA" asks
  // the office to text the NEXT customer a heads-up; "Office" just flags dispatch.
  const lateMins = () => (nextLine ? Math.max(1, -nextLine.slack) : 15);
  const lateRisk = (needsHelp) => {
    setLateMsg(null);
    const mins = lateMins();
    start(async () => {
      const note = needsHelp ? `Late risk — next job (${nextLine?.customer} ${nextLine?.at}) will be late` : `Heads-up: running into ${nextLine?.customer}'s ${nextLine?.at} — office, text them an updated ETA`;
      const r = await reportEta(job.id, mins, note, needsHelp, needsHelp ? null : new Date(Date.now() + mins * 60000).toISOString());
      setLateMsg(r); if (r?.ok) { setLateAck(true); router.refresh(); }
    });
  };
  // 📞 Call the customer about the delay — opens the dialer AND logs it to the office (a verbal heads-up
  // still counts as handling the late risk). Clears the nudge like the other two actions.
  const callCust = () => {
    if (tel && typeof window !== 'undefined') window.location.href = `tel:${tel}`;
    setLateMsg(null);
    const mins = lateMins();
    start(async () => {
      const r = await reportEta(job.id, mins, `Calling ${cust.name || 'the customer'} about the late arrival`, false, new Date(Date.now() + mins * 60000).toISOString());
      setLateMsg(r); if (r?.ok) { setLateAck(true); router.refresh(); }
    });
  };
  const qa = (bg, fg) => ({ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '12px 8px', borderRadius: 10, border: 'none', background: bg, color: fg, fontWeight: 800, fontSize: 13, textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap' });

  // Whole card is a tap-target into the job (HTML cbOpenJob) — but clicks on inner controls (Running late
  // button/form) must NOT navigate, so bail if the tap landed on an interactive element (cbOnsiteCardTap).
  const goJob = (e) => { if (e.target.closest && e.target.closest('button, a, input, textarea, select, [data-no-nav]')) return; router.push(`/job/${job.id}`); };
  const accent = done ? 'var(--fg-3)' : cur === 'on_site' ? 'var(--green-bright)' : cur === 'enroute' ? 'var(--amber)' : variant === 'active' ? 'var(--amber)' : 'var(--border-strong)';

  return (
    <div className={variant === 'active' ? 'card card-amber' : 'card'} onClick={goJob} title="Open this job"
      style={{ opacity: variant === 'done' || cancelled ? 0.6 : 1, padding: compact ? '12px 14px' : undefined, cursor: 'pointer', borderLeft: `4px solid ${accent}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'start' }}>
        <div style={{ textAlign: 'center', minWidth: 52 }}>
          <div style={{ fontWeight: 800, color: 'var(--amber)', fontSize: 14, fontFamily: "'JetBrains Mono',monospace" }}>{fmtTime(job.scheduled_at)}</div>
          {job.job_number && <div className="muted" style={{ fontSize: 10, fontFamily: 'monospace' }}>#{job.job_number}</div>}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {urgent && <span className="alert-dot" aria-hidden="true" />}
            <span style={{ color: 'var(--fg-1)' }}>{cust.name || 'Customer'} <span style={{ color: 'var(--amber)', fontSize: 12, fontWeight: 600 }}>›</span></span>
            {urgent && <span className="pill pill-red pill-blink" style={{ marginLeft: 8 }}>RUNNING LATE</span>}
          </div>
          {cust.address && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>📍 {cust.address}</div>}
          {tel && <a href={`tel:${tel}`} data-no-nav style={{ fontSize: 12, marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--amber)', textDecoration: 'none', fontWeight: 600 }}>📞 {fmtPhone(cust.phone)}</a>}
          {typeBits && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>🔧 {typeBits}</div>}
          {seeAll && t.name && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}><PersonCard name={t.name}><span style={{ cursor: 'pointer' }}>👷 {t.name}</span></PersonCard></div>}
          <TagRow tags={tags} />
          {/* (Removed the on-site $/hr pace line — billable hours / $-per-hour is a MANAGEMENT report now,
              pulled company-wide + per-tech, not shown on the tech's card.) */}
          {/* 🎯 next stop — drive + will you make their window */}
          {variant === 'active' && !cancelled && !done && nextLine ? (
            <div style={{ marginTop: 5, fontSize: 11, color: 'var(--fg-2)', background: 'rgba(255,179,0,0.08)', border: '1px solid var(--amber-dim)', padding: '3px 7px', borderRadius: 6, display: 'inline-block' }}>🎯 {nextLine.driveMin}-min drive → <strong>{nextLine.customer}</strong> {nextLine.at} · <span style={{ color: nextLine.slack >= 0 ? 'var(--green)' : 'var(--red)' }}>{nextLine.slack >= 0 ? `+${nextLine.slack} slack` : `${-nextLine.slack} tight`}</span></div>
          ) : null}
        </div>
        <span className={pill.cls} style={pill.color ? { color: pill.color } : undefined}>{cur === 'on_site' && elapsedMin > 0 ? `${pill.label} · ${elapsedMin}m` : pill.label}</span>
      </div>

      {/* 📍 GPS says you're at the job — confirm Arrive (the office was already pinged). */}
      {variant === 'active' && canAct && !cancelled && !done && cur === 'enroute' && atJob && (
        <div data-no-nav style={{ marginTop: 8 }}>
          <button onClick={() => setStatus('on_site')} disabled={pending}
            style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: 'var(--green-bright, #2ee6a0)', color: '#06210f', fontWeight: 800, fontSize: 14, cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1 }}>
            📍 You're at {(cust.name || 'the customer').split(/\s+/)[0]}&apos;s — tap to Arrive
          </button>
          {err
            ? <div style={{ fontSize: 11.5, marginTop: 5, color: 'var(--red)', fontWeight: 700 }}>⚠ {err} — tap to try again.</div>
            : <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>GPS detected you here · office notified</div>}
        </div>
      )}

      {/* Quick actions — Call · Text · Navigate+Notify (one tap = opens GPS + en-route text + updates dispatch).
          Navigate+Notify only while heading there (scheduled/enroute, before the arrive prompt). */}
      {variant === 'active' && canAct && !cancelled && !done && (
        <div data-no-nav style={{ marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: (cur !== 'on_site' && !atJob) ? '1fr 1fr 1.5fr' : '1fr 1fr', gap: 6 }}>
            <a href={tel ? `tel:${tel}` : undefined} style={{ ...qa('#7a1f1f', '#fff'), opacity: tel ? 1 : 0.5, pointerEvents: tel ? 'auto' : 'none' }}>📞 Call</a>
            <a href={tel ? `sms:${tel}` : undefined} style={{ ...qa('#1565c0', '#fff'), opacity: tel ? 1 : 0.5, pointerEvents: tel ? 'auto' : 'none' }}>💬 Text</a>
            {cur !== 'on_site' && !atJob && (
              <button onClick={navNotify} disabled={pending} style={{ ...qa('#1b5e20', '#fff'), opacity: pending ? 0.6 : 1 }}>🧭 Navigate + Notify</button>
            )}
          </div>
          {cur !== 'on_site' && !atJob && <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>Navigate + Notify · opens GPS · sends en-route text · updates dispatch</div>}
          {enrMsg && <div style={{ fontSize: 11.5, marginTop: 6, color: enrMsg.ok ? 'var(--green)' : 'var(--red)' }}>{enrMsg.msg}</div>}
        </div>
      )}

      {/* ⏳ Finish-by / 🚨 LATE RISK — on-site with a next job. Green "wrap up by X" on pace; red box w/
          Text-ETA (office texts the next customer) + Office when running over. */}
      {variant === 'active' && canAct && !cancelled && !done && cur === 'on_site' && nextLine && (
        nextLine.slack >= 0 ? (
          <div data-no-nav style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: 'var(--amber)' }}>⏳ Wrap up by {nextLine.finishBy} to keep {nextLine.customer} {nextLine.at} on time</div>
        ) : (
          <div data-no-nav style={{ marginTop: 8, border: '1px solid var(--red)', background: 'rgba(239,83,80,.10)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--red)' }}>🚨 LATE RISK: NEXT JOB WILL BE LATE</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>Finish est {nextLine.finishBy} · {nextLine.driveMin} min drive → arrive {nextLine.at} · {nextLine.customer} needs a heads-up.</div>
            {lateAck ? (
              <div style={{ fontSize: 11.5, marginTop: 8, color: 'var(--green)', fontWeight: 700 }}>✓ Heads-up handled — {nextLine.customer} won&apos;t be left guessing.</div>
            ) : (
              <>
                {/* Forced choice — the box stays until the tech does ONE of these three (no dismiss). */}
                <div style={{ fontWeight: 800, fontSize: 10.5, marginTop: 8, color: 'var(--red)' }}>Pick one before you keep going:</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button onClick={() => lateRisk(false)} disabled={pending} style={{ flex: 1, padding: '9px 6px', borderRadius: 8, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>💬 Text ETA</button>
                  <button onClick={callCust} disabled={pending || !tel} style={{ flex: 1, padding: '9px 6px', borderRadius: 8, border: '1px solid var(--red)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontWeight: 800, fontSize: 12, cursor: (pending || !tel) ? 'default' : 'pointer', opacity: (pending || !tel) ? 0.6 : 1 }}>📞 Call</button>
                  <button onClick={() => lateRisk(true)} disabled={pending} style={{ flex: 1, padding: '9px 6px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>🏢 Office</button>
                </div>
              </>
            )}
            {lateMsg && <div style={{ fontSize: 11, marginTop: 6, color: lateMsg.ok ? 'var(--green)' : 'var(--red)' }}>{lateMsg.msg}</div>}
          </div>
        )
      )}

      {/* Running late / how-much-longer relay — the ON-SITE ETA nudge. data-no-nav stops the card-tap.
          Suppressed when the red LATE-RISK box (above) is showing: it already has Text-ETA + Office and
          they share lateMsg, so rendering both is a confusing double control for the same state. */}
      {variant === 'active' && canAct && !cancelled && !done && cur === 'on_site' && !(nextLine && nextLine.slack < 0) && (
        <div data-no-nav style={{ marginTop: 8 }}>
          {!lateOpen ? (
            <button onClick={() => { setLateOpen(true); setLateMsg(null); }}
              style={{ width: '100%', padding: '11px', borderRadius: 10, border: '1px solid var(--amber-dim)', background: 'rgba(255,179,0,.10)', color: 'var(--amber)', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
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
              <input value={etaNote} onChange={(e) => setEtaNote(e.target.value)} placeholder="Reason (required) — e.g. cable stuck, need 30 more min"
                style={{ width: '100%', marginTop: 8, padding: '9px 10px', borderRadius: 8, border: '1px solid ' + (etaNote.trim() ? 'var(--border)' : 'var(--amber-dim)'), background: 'var(--surface-2)', color: 'var(--fg-1)', fontSize: 13 }} />
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>{etaNote.trim() ? <>New ETA ≈ <strong style={{ color: 'var(--fg-1)' }}>{newEtaLabel}</strong> · the office relays your reason to the customer.</> : 'Add a reason first — the office relays it to the customer.'}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button disabled={pending || !etaNote.trim()} onClick={() => sendEta(false)} style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: 'var(--amber)', color: '#1a1206', fontWeight: 800, fontSize: 13, cursor: (pending || !etaNote.trim()) ? 'default' : 'pointer', opacity: (pending || !etaNote.trim()) ? 0.6 : 1 }}>Send update</button>
                <button disabled={pending || !etaNote.trim()} onClick={() => sendEta(true)} title="Ping dispatch for help" style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontWeight: 700, fontSize: 12, cursor: (pending || !etaNote.trim()) ? 'default' : 'pointer', opacity: (pending || !etaNote.trim()) ? 0.6 : 1 }}>Need office help</button>
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

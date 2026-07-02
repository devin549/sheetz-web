'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assignTech, updateJobStatus, setDuration } from './actions';
import { ACCENT, STATUS_DOT, crewColor, initials, priorityOf, hourLabel, money, fmtTime } from './boardTokens';
import JobPanel from './JobPanel';
import { ContextMenu, CancelModal, DurationModal, AddTechModal } from './JobActions';
import PersonCard from '@/components/PersonCard';
import { Wrench, MapPin, Camera, Inbox } from 'lucide-react';

// Layout — absolute px-per-hour grid, the same model the live board uses so the now-line and
// drop-targeting are computed straight from mouse position.
// 🔍 THE WIDTH SECRET (Fable prototype port): render ONLY the working day (6a–9p), not 24 hours — the
// old grid burned half its pixels on midnight-to-dawn where a job never lives. Blocks got ~70% wider
// for free. Jobs outside the window clamp to the edges (rare after-hours emergencies still visible).
const TECH_COL = 150, HEADER_H = 30;
const DAY_START = 6, DAY_END = 21; // 6am → 9pm
// Density presets (Fable): dispatcher-controlled zoom, persisted per browser.
const DENSITY = {
  compact: { px: 80, row: 44 },
  balanced: { px: 110, row: 56 },
  spacious: { px: 150, row: 72 },
};

// fractional hour (0–24) of an ISO time, in the VIEWER's local timezone (so placement matches the
// times shown on the cards — both use the browser clock, not Vercel's UTC).
function startHourOf(iso) { try { const d = new Date(iso); return d.getHours() + d.getMinutes() / 60; } catch { return 0; } }

export default function BoardGrid({ techs, jobs, tray, techStatus, canAssign, canStatus }) {
  // "now" in the browser's timezone, re-checked each minute so the now-line tracks the real clock.
  const [nowHour, setNowHour] = useState(() => { const n = new Date(); return n.getHours() + n.getMinutes() / 60; });
  useEffect(() => { const id = setInterval(() => { const n = new Date(); setNowHour(n.getHours() + n.getMinutes() / 60); }, 30000); return () => clearInterval(id); }, []);
  const router = useRouter();

  // Dispatcher zoom (Fable density presets) — shadows the old module consts so every hour-math line
  // below keeps working. Persisted per browser.
  const [density, setDensity] = useState('balanced');
  useEffect(() => { try { const d = localStorage.getItem('cb-board-density'); if (DENSITY[d]) setDensity(d); } catch (_) {} }, []);
  const pickDensity = (d) => { setDensity(d); try { localStorage.setItem('cb-board-density', d); } catch (_) {} };
  const { px: PX_PER_HOUR, row: ROW_H } = DENSITY[density];
  const GRID_W = (DAY_END - DAY_START) * PX_PER_HOUR;
  // hour ↔ x helpers: hours stay ABSOLUTE (0–24) everywhere; only render/pointer math shifts by DAY_START.
  const hx = (h) => (Math.max(DAY_START, Math.min(DAY_END, h)) - DAY_START) * PX_PER_HOUR;
  const gridRef = useRef(null);
  const bodyRef = useRef(null);
  const [pending, start] = useTransition();
  const [drop, setDrop] = useState(null); // { rowIdx, hour } live drop indicator
  const [sel, setSel] = useState(null);   // selected job → detail panel
  const [menu, setMenu] = useState(null); // {x,y,job} right-click menu
  const [cancelT, setCancelT] = useState(null);
  const [durT, setDurT] = useState(null);
  const [addT, setAddT] = useState(null); // { job, kind } → add 2nd tech / helper modal
  const [hover, setHover] = useState(null); // {job,x,y} — desktop hover info card

  // ── Move a job by custom mouse-drag (ported from dispatchboard_timegrid.html) — the original
  // hides, a ghost follows the cursor, and a breathing dashed box snaps to the target slot. This is
  // what makes moving jobs feel like the live board instead of the generic OS drag image.
  const [moveDrag, setMoveDrag] = useState(null);   // {jobId, mouseX, mouseY} → floating ghost
  const [moveHover, setMoveHover] = useState(null);  // {techId, startHour} → snap target
  const moveRef = useRef(null);                      // {jobId, offsetX, offsetY, durationHours, w, sx, sy}
  const hoverRef = useRef(null);
  const didMove = useRef(false);
  const ghostRef = useRef(null); // floating drag ghost — positioned imperatively so it tracks the cursor with no per-frame re-render
  const positionGhost = () => { const el = ghostRef.current, m = moveRef.current; if (el && m && m.lastX != null) el.style.transform = `translate3d(${m.lastX}px, ${m.lastY}px, 0)`; };
  const techName = (id) => { const t = techs.find((x) => x.id === id); return t ? t.name : ''; };
  const refresh = () => router.refresh();

  // ── edge-resize to stretch a job's duration (live board's resize handle) ──
  const resizeRef = useRef(null);        // { jobId, startX, startDur, curDur }
  const suppressDrag = useRef(false);    // block HTML5 drag while resizing
  const didResize = useRef(false);       // suppress the click-to-open after a resize
  const [resizeView, setResizeView] = useState(null); // { jobId, curDur } for live width
  function beginResize(e, job) {
    e.preventDefault(); e.stopPropagation();
    const dur = job.duration_min || 60;
    resizeRef.current = { jobId: job.id, startX: e.clientX, startDur: dur, curDur: dur };
    suppressDrag.current = true; didResize.current = false;
    setResizeView({ jobId: job.id, curDur: dur });
  }
  useEffect(() => {
    function move(e) {
      const r = resizeRef.current; if (!r) return;
      const deltaH = (e.clientX - r.startX) / PX_PER_HOUR;
      const dur = Math.max(15, Math.min(720, Math.round((r.startDur + deltaH * 60) / 15) * 15));
      if (Math.abs(e.clientX - r.startX) > 3) didResize.current = true;
      r.curDur = dur;
      setResizeView({ jobId: r.jobId, curDur: dur });
    }
    function up() {
      const r = resizeRef.current; if (!r) return;
      resizeRef.current = null; setResizeView(null);
      setTimeout(() => { suppressDrag.current = false; }, 0);
      if (r.curDur !== r.startDur) start(async () => { await setDuration(r.jobId, r.curDur); router.refresh(); });
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [router, PX_PER_HOUR]); // PX in deps — a density change rebinds the resize math (no stale px)

  // right-click menu actions
  const STATUS_OF = { enroute: 'enroute', onsite: 'on_site', done: 'done' };
  function onMenuAction(id) {
    const j = menu && menu.job; setMenu(null);
    if (!j) return;
    if (id === 'open' || id === 'reassign') setSel(j);
    else if (id === 'duration') setDurT(j);
    else if (id === 'cancel') setCancelT(j);
    else if (id === 'call') { if (j.phone) window.open('tel:' + String(j.phone).replace(/[^0-9+]/g, '')); }
    else if (id === 'addtech') setAddT({ job: j, kind: 'second_tech' });
    else if (id === 'addhelper') setAddT({ job: j, kind: 'helper' });
    else if (id === 'unassign') start(async () => { await assignTech(j.id, null); refresh(); });
    else if (STATUS_OF[id]) start(async () => { await updateJobStatus(j.id, STATUS_OF[id]); refresh(); });
  }
  const openMenu = (e, j) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, job: j }); };

  // group techs into crews → flat render rows (crew header rows keep the floor(y/ROW_H) math valid)
  const crews = {};
  techs.forEach((t) => { const c = t.crew || 'Crew'; (crews[c] = crews[c] || []).push(t); });
  const rows = [];
  Object.keys(crews).sort().forEach((c) => { rows.push({ kind: 'crew', name: c }); crews[c].forEach((t) => rows.push({ kind: 'tech', tech: t })); });
  const techAtRow = (i) => (rows[i] && rows[i].kind === 'tech' ? rows[i].tech : null);
  // Forgiving target: if you land on a crew header or just past the edge, snap to the NEAREST tech
  // row instead of failing (fixes "near the edge it won't work").
  const nearestTechRow = (idx) => {
    const n = rows.length; if (!n) return null;
    let i = Math.max(0, Math.min(n - 1, idx));
    if (rows[i].kind === 'tech') return rows[i].tech;
    for (let d = 1; d < n; d++) {
      if (rows[i - d] && rows[i - d].kind === 'tech') return rows[i - d].tech;
      if (rows[i + d] && rows[i + d].kind === 'tech') return rows[i + d].tech;
    }
    return null;
  };

  // index grid jobs by techId
  const byTech = {};
  jobs.forEach((j) => { (byTech[j.techId] = byTech[j.techId] || []).push(j); });
  // zebra order (tech rows only — crew banners don't count)
  const techOrder = {}; { let ti = 0; rows.forEach((r) => { if (r.kind === 'tech') techOrder[r.tech.id] = ti++; }); }

  // auto-center on "now" once on mount
  const didScroll = useRef(false);
  useEffect(() => {
    if (didScroll.current) return;
    const g = gridRef.current; if (!g) return;
    didScroll.current = true;
    const n = new Date(); const h = n.getHours() + n.getMinutes() / 60;
    const laneW = g.clientWidth - TECH_COL;
    g.scrollLeft = Math.max(0, hx(h - 1) - laneW / 3);
  }, []);

  function locate(e) {
    const body = bodyRef.current; if (!body) return null;
    const r = body.getBoundingClientRect();
    const x = e.clientX - r.left - TECH_COL;
    const y = e.clientY - r.top;
    if (x < 0 || y < 0) return null;
    const rowIdx = Math.floor(y / ROW_H);
    const tech = techAtRow(rowIdx);
    if (!tech) return null;
    const hour = Math.max(DAY_START, Math.min(DAY_END - 0.25, DAY_START + Math.round((x / PX_PER_HOUR) * 4) / 4)); // snap 15-min, window-relative
    return { rowIdx, hour, techId: tech.id };
  }
  function onDragOver(e) { e.preventDefault(); const loc = locate(e); setDrop(loc ? { rowIdx: loc.rowIdx, hour: loc.hour } : null); }
  function onDrop(e) {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('text/job-id');
    const loc = locate(e);
    setDrop(null);
    if (!jobId || !loc) return;
    // build the scheduled time on the CLIENT (browser TZ) so it matches where it was dropped
    const d = new Date(); d.setHours(Math.floor(loc.hour), Math.round((loc.hour % 1) * 60), 0, 0);
    const iso = d.toISOString();
    start(async () => { await assignTech(jobId, loc.techId, iso); router.refresh(); });
  }
  function dragStart(e, jobId) { e.dataTransfer.setData('text/job-id', jobId); e.dataTransfer.effectAllowed = 'move'; }

  // Move a job already on the grid. We DON'T commit to a drag on mousedown — only once the pointer
  // travels past a small threshold. That keeps a plain click a click (opens the panel) and makes
  // pickup/drop feel deliberate instead of grabbing on every touch. The ghost is positioned via a
  // ref (no per-frame React render), so it tracks the cursor 1:1 with no float/lag.
  function startMove(e, j) {
    if (e.button !== 0 || j.statusKey === 'done') return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const m = {
      jobId: j.id, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top,
      durationHours: (j.duration_min || 60) / 60, w: rect.width, sx: e.clientX, sy: e.clientY,
      active: false, lastX: null, lastY: null,
    };
    moveRef.current = m;
    didMove.current = false; hoverRef.current = null; setHover(null);

    let rafId = 0, pend = null;
    const THRESH = 6; // px the pointer must travel before a click becomes a drag
    const flush = () => {
      rafId = 0; if (!pend) return;
      const { x: mx, y: my } = pend; pend = null;
      const mm = moveRef.current; const body = bodyRef.current; if (!mm || !body) return;
      // activate only after clearing the threshold → a click stays a click
      if (!mm.active) {
        if (Math.abs(mx - mm.sx) < THRESH && Math.abs(my - mm.sy) < THRESH) return;
        mm.active = true; didMove.current = true;
        if (typeof document !== 'undefined') { document.body.style.cursor = 'grabbing'; document.body.style.userSelect = 'none'; }
        setMoveDrag({ jobId: mm.jobId }); // one render: shows ghost + hides the original
      }
      // position the ghost imperatively — no per-frame React render, so no lag/float
      mm.lastX = mx - mm.offsetX; mm.lastY = my - mm.offsetY; positionGhost();
      // gentle, proportional auto-scroll near the lane edges (ramps with depth, no runaway)
      const g = gridRef.current;
      if (g) {
        const gr = g.getBoundingClientRect(), EDGE = 60, MAX = 10;
        if (mx > gr.right - EDGE) g.scrollLeft += Math.ceil(((mx - (gr.right - EDGE)) / EDGE) * MAX);
        else if (mx < gr.left + TECH_COL + EDGE) g.scrollLeft = Math.max(0, g.scrollLeft - Math.ceil((((gr.left + TECH_COL + EDGE) - mx) / EDGE) * MAX));
      }
      // forgiving snap target — nearest tech row + 15-min slot
      const r = body.getBoundingClientRect();
      const laneX = mx - r.left - TECH_COL - mm.offsetX;
      const tech = nearestTechRow(Math.floor((my - r.top) / ROW_H));
      if (!tech) { if (hoverRef.current) { hoverRef.current = null; setMoveHover(null); } return; }
      const snapped = DAY_START + Math.round((laneX / PX_PER_HOUR) * 4) / 4;
      const startHour = Math.max(DAY_START, Math.min(DAY_END - mm.durationHours, snapped));
      const prev = hoverRef.current;
      if (!prev || prev.techId !== tech.id || prev.startHour !== startHour) {
        const hv = { techId: tech.id, startHour }; hoverRef.current = hv; setMoveHover(hv); // re-render ONLY when the slot changes
      }
    };
    const onMove = (ev) => { pend = { x: ev.clientX, y: ev.clientY }; if (!rafId) rafId = requestAnimationFrame(flush); };
    const onUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (typeof document !== 'undefined') { document.body.style.cursor = ''; document.body.style.userSelect = ''; }
      const mm = moveRef.current, hv = hoverRef.current;
      if (mm && mm.active && hv && didMove.current) {
        const d = new Date(); d.setHours(Math.floor(hv.startHour), Math.round((hv.startHour % 1) * 60), 0, 0);
        const iso = d.toISOString();
        start(async () => { await assignTech(mm.jobId, hv.techId, iso); router.refresh(); });
      }
      moveRef.current = null; hoverRef.current = null; setMoveDrag(null); setMoveHover(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // hour lines strong + 15-min ticks faint (Fable) — the snap grid is visible, so drops feel precise.
  const laneBg = `repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px ${PX_PER_HOUR}px), repeating-linear-gradient(to right, color-mix(in oklab, var(--border) 45%, transparent) 0 1px, transparent 1px ${PX_PER_HOUR / 4}px)`;
  const Dot = ({ k }) => <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[k] || 'var(--fg-3)', display: 'inline-block' }} />;

  // GRADED late (Fable): scheduled gets 6 min of grace, EN ROUTE gets 18 (they're moving — don't nag),
  // ON SITE never flags (Devin's rule: the blink dies when the tech's in the house). Returns minutes late.
  const lateMins = (j) => {
    if (!j.scheduledISO || ['onsite', 'done', 'cancelled'].includes(j.statusKey)) return 0;
    const grace = j.statusKey === 'enroute' ? 0.3 : 0.1;
    const s = startHourOf(j.scheduledISO);
    return nowHour > s + grace ? Math.round((nowHour - s) * 60) : 0;
  };
  const isLate = (j) => lateMins(j) > 0;
  const lateChip = (m) => (m > 60 ? 'MISSED' : `+${m}m`);

  function JobBlock({ j, draggable }) {
    const pr = priorityOf(j.priority);
    const left = hx(startHourOf(j.scheduledISO)); // clamped to the 6a–9p window
    const live = resizeView && resizeView.jobId === j.id;
    const dur = live ? resizeView.curDur : (j.duration_min || 60);
    const width = Math.max(22, (dur / 60) * PX_PER_HOUR - 2);
    const canResize = (canStatus || canAssign) && j.statusKey !== 'done';
    const mins = lateMins(j);
    const late = mins > 0;
    const hiding = moveDrag && moveDrag.jobId === j.id; // original hides while its ghost drags
    // Status IS the color (Devin: board felt generic/boring) — amber scheduled · blue rolling · green
    // on-site · red late · muted-✓ done. One glance = the day's shape, matching the status-dot legend.
    const done = j.statusKey === 'done';
    const enroute = j.statusKey === 'enroute' && !late;
    const tone = late ? 'var(--red)' : (STATUS_DOT[j.statusKey] || 'var(--accent)');
    return (
      <div
        className={late ? 'cb-late-blink' : undefined}
        onMouseDown={canAssign ? (e) => startMove(e, j) : undefined}
        onClick={() => { if (didResize.current) { didResize.current = false; return; } if (didMove.current) { didMove.current = false; return; } setSel(j); }}
        onContextMenu={(e) => openMenu(e, j)}
        onMouseEnter={(e) => { if (!moveDrag) setHover({ job: j, x: e.clientX, y: e.clientY }); }}
        onMouseMove={(e) => setHover((h) => (!moveDrag && h && h.job.id === j.id ? { job: j, x: e.clientX, y: e.clientY } : h))}
        onMouseLeave={() => setHover(null)}
        style={{
          position: 'absolute', left, top: 5, height: ROW_H - 14, width,
          background: live ? 'color-mix(in oklab, var(--accent) 16%, var(--surface-2))' : `color-mix(in oklab, ${tone} ${done ? 6 : 14}%, var(--surface-2))`,
          borderLeft: `3px solid ${late ? 'var(--red)' : (pr ? pr.color : tone)}`,
          border: `1px solid color-mix(in oklab, ${late ? 'var(--red)' : tone} ${done ? 18 : 38}%, var(--border))`,
          borderLeftWidth: 3, borderLeftColor: late ? 'var(--red)' : (pr ? pr.color : tone),
          borderRadius: 5, padding: '3px 5px', overflow: 'hidden', cursor: canAssign ? 'grab' : 'pointer', zIndex: live ? 5 : 2,
          opacity: hiding ? 0 : (done ? 0.65 : 1),
          // Fable settle: a moved/re-timed block glides into its slot instead of teleporting. Off while
          // live-resizing (the width must track the cursor 1:1).
          transition: live ? 'none' : 'left .18s cubic-bezier(.2,.9,.3,1.1), width .18s ease',
        }}
      >
        {/* En-route: animated stripes — the board visibly MOVES while trucks do. */}
        {enroute && <div className="cb-stripes" aria-hidden="true" style={{ position: 'absolute', inset: 0, color: tone, pointerEvents: 'none', borderRadius: 5 }} />}
        <div style={{ position: 'relative', zIndex: 1, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: late ? 'var(--red)' : 'var(--fg-1)', textDecoration: done ? 'line-through' : 'none' }}>
          {pr && <span style={{ color: pr.color, fontWeight: 800 }}>{pr.short} </span>}{j.dns && <span title="Do not service">🚫 </span>}{j.member && <span title="Member">⭐ </span>}{j.mustTell && <span title={j.mustTell}>🚨 </span>}{done && '✓ '}{j.customer}
        </div>
        <div className="muted" style={{ position: 'relative', zIndex: 1, fontSize: 9, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>{fmtTime(j.scheduledISO)}{live ? ` · ${dur}m` : (j.amount ? ' · ' + money(j.amount) : '')}</span>
          {late && <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 3, padding: '0 3px', fontSize: 8.5, letterSpacing: '.04em' }}>{lateChip(mins)}</span>}
          {j.photoCount > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><Camera size={9} />{j.photoCount}</span>}
        </div>
        {canResize && (
          <div onMouseDown={(e) => beginResize(e, j)} title="Drag to set how long it'll take"
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', zIndex: 6 }} />
        )}
      </div>
    );
  }

  // At-a-glance badge row. Data-driven so Phase-B badges (video / QA pass-fail / paid /
  // callback / warranty) just append here once their columns land.
  function JobBadges({ j }) {
    const badges = [];
    if (j.photoCount > 0) badges.push({ key: 'photos', icon: <Camera size={11} />, text: j.photoCount, title: `${j.photoCount} photo${j.photoCount > 1 ? 's' : ''}` });
    if (!badges.length) return null;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
        {badges.map((b) => (
          <span key={b.key} title={b.title} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 7, background: 'var(--surface-2)', color: 'var(--fg-2)', border: '1px solid var(--border)' }}>{b.icon}{b.text}</span>
        ))}
      </div>
    );
  }

  function TrayCard({ j }) {
    const pr = priorityOf(j.priority);
    const typeBits = [j.job_type, j.amount ? money(j.amount) : null].filter(Boolean).join(' · ');
    return (
      <div draggable={canAssign} onDragStart={canAssign ? (e) => dragStart(e, j.id) : undefined}
        onClick={() => setSel(j)} onContextMenu={(e) => openMenu(e, j)}
        className={`card${j.rollPending ? ' cb-blink-red' : ''}`} style={{ borderLeft: `3px solid ${j.rollPending ? 'var(--red)' : (pr ? pr.color : (j.techId ? ACCENT : 'var(--red)'))}`, cursor: 'pointer', padding: '10px 12px' }}>
        {j.rollPending && <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--red)', marginBottom: 4, letterSpacing: '.04em' }}>🔁 ROLLED · SCHEDULE + CALL CUSTOMER</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{pr && <span style={{ color: pr.color, fontWeight: 800 }}>{pr.short} </span>}{j.dns && <span title="Do not service">🚫 </span>}{j.member && <span title="Member">⭐ </span>}{j.mustTell && <span title={j.mustTell}>🚨 </span>}{j.customer}</span>
          <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{j.scheduledISO ? fmtTime(j.scheduledISO) : 'no time'}</span>
        </div>
        {j.address && <div className="muted" style={{ fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} /> {j.address}</div>}
        {typeBits && <div className="muted" style={{ fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><Wrench size={11} /> {typeBits}</div>}
        <JobBadges j={j} />
      </div>
    );
  }

  return (
    <>
      {/* 📥 JOBS TO PLACE — the dispatcher's actual work, so it sits ABOVE the grid as a horizontal shelf
          (it used to hide below the fold: "24 unassigned" you had to scroll to find). Drag a card straight
          down onto a tech's row. Unassigned = red edge · assigned-but-no-time = amber edge. */}
      {tray.length > 0 && (
        <div style={{ marginBottom: 10, border: '1px solid color-mix(in oklab, var(--red) 30%, var(--border))', borderRadius: 12, background: 'color-mix(in oklab, var(--red) 4%, var(--surface-1))', padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Inbox size={14} style={{ color: 'var(--red)' }} />
            <span style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>Jobs to place · {tray.length}</span>
            <span className="muted" style={{ fontSize: 11 }}>{canAssign ? 'drag a card down onto a tech’s row' : ''}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, opacity: pending ? 0.6 : 1 }}>
            {[...tray.filter((j) => !j.techId), ...tray.filter((j) => j.techId && !j.scheduledISO)].map((j) => (
              <div key={j.id} style={{ flex: '0 0 210px' }}><TrayCard j={j} /></div>
            ))}
          </div>
        </div>
      )}

      <div ref={gridRef} style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
        <div style={{ minWidth: TECH_COL + GRID_W }}>
          {/* hour header — working-day window + the density zoom control */}
          <div style={{ display: 'flex', height: HEADER_H, borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: TECH_COL, flexShrink: 0, position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 3, fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px' }}>
              <span>Tech</span>
              {/* density: ▂ ▄ █ — dispatcher zoom, persisted */}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2 }}>
                {[['compact', '▂'], ['balanced', '▄'], ['spacious', '█']].map(([d, g]) => (
                  <button key={d} onClick={() => pickDensity(d)} title={`${d} view`} style={{ border: 'none', background: density === d ? 'var(--amber)' : 'transparent', color: density === d ? '#1a1206' : 'var(--fg-3)', borderRadius: 4, fontSize: 9, padding: '1px 5px', cursor: 'pointer', lineHeight: 1.6 }}>{g}</button>
                ))}
              </span>
            </div>
            <div style={{ position: 'relative', width: GRID_W }}>
              {Array.from({ length: DAY_END - DAY_START }, (_, i) => { const h = DAY_START + i; return (
                <div key={h} style={{ position: 'absolute', left: hx(h), top: 0, bottom: 0, width: PX_PER_HOUR, textAlign: 'center', fontSize: 10, fontFamily: 'var(--mono)', color: h === Math.floor(nowHour) ? ACCENT : 'var(--fg-3)', fontWeight: h === Math.floor(nowHour) ? 800 : 400, lineHeight: `${HEADER_H}px`, borderLeft: '1px solid var(--border)' }}>{hourLabel(h)}</div>
              ); })}
            </div>
          </div>

          {/* body (drop zone) */}
          <div ref={bodyRef} onDragOver={onDragOver} onDrop={onDrop} onDragLeave={() => setDrop(null)} style={{ position: 'relative' }}>
            {rows.map((row, i) => {
              if (row.kind === 'crew') {
                // CB-amber team band — the crew name reads like a section banner. Height stays ROW_H:
                // the drag/drop indicators position by rowIdx × ROW_H, so every row must be that tall.
                const cc = crewColor(row.name);
                return (
                  <div key={'c' + i} style={{ display: 'flex', height: ROW_H, alignItems: 'center', background: `color-mix(in oklab, ${cc} 9%, var(--surface-1))`, borderBottom: `1px solid color-mix(in oklab, ${cc} 35%, var(--border))`, borderLeft: `3px solid ${cc}` }}>
                    <div style={{ width: TECH_COL, flexShrink: 0, position: 'sticky', left: 0, background: 'transparent', zIndex: 3, padding: '0 10px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: cc, whiteSpace: 'nowrap' }}>▾ {row.name}</div>
                    <div style={{ flex: 1 }} />
                  </div>
                );
              }
              const t = row.tech; const st = techStatus[t.id];
              const tJobs = byTech[t.id] || [];
              const maxLate = tJobs.reduce((m, j) => Math.max(m, lateMins(j)), 0); // the tech's worst late job
              const bookedH = Math.round(tJobs.reduce((s, j) => s + (Number(j.duration_min) || 60), 0) / 6) / 10;
              const zebra = techOrder[t.id] % 2 === 1;
              return (
                <div key={t.id} style={{ display: 'flex', height: ROW_H, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: TECH_COL, flexShrink: 0, position: 'sticky', left: 0, background: maxLate ? 'color-mix(in oklab, var(--red) 8%, var(--bg))' : 'var(--bg)', zIndex: 3, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderRight: '1px solid var(--border)' }}>
                    {/* Late alarm lives on the PERSON (Fable): red bar + +Xm/MISSED chip — WHO's bleeding, not just what. */}
                    {maxLate > 0 && <span className="cb-late-blink" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--red)', borderRadius: 0 }} aria-hidden="true" />}
                    {/* Status ring: green steady = ON SITE · blue pulse = ROLLING — who's moving, at a glance. */}
                    <PersonCard name={t.name}><span className={st === 'onsite' ? 'cb-ring-onsite' : st === 'enroute' ? 'cb-ring-enroute' : undefined} style={{ width: 26, height: 26, borderRadius: '50%', background: crewColor(t.crew || 'Crew'), color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(t.name)}</span></PersonCard>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                        {maxLate > 0 && <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 3, padding: '0 3px', fontSize: 8.5, letterSpacing: '.04em', flexShrink: 0 }}>{lateChip(maxLate)}</span>}
                      </span>
                      <span style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--fg-3)' }}>
                        {st ? <><Dot k={st} /> {st}</> : 'idle'}
                        {tJobs.length > 0 && <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)' }}>{tJobs.length}j · {bookedH}h</span>}
                      </span>
                    </span>
                  </div>
                  <div style={{ position: 'relative', width: GRID_W, backgroundImage: laneBg, backgroundColor: zebra ? 'color-mix(in oklab, var(--fg-1) 2.5%, transparent)' : undefined }}>
                    {(byTech[t.id] || []).map((j) => <JobBlock key={j.id} j={j} draggable={canAssign} />)}
                  </div>
                </div>
              );
            })}

            {/* drop indicator (tray → grid) */}
            {drop && (
              <div style={{ position: 'absolute', pointerEvents: 'none', top: drop.rowIdx * ROW_H + 4, left: TECH_COL + hx(drop.hour), width: PX_PER_HOUR * 0.92, height: ROW_H - 8, border: `2px dashed ${ACCENT}`, borderRadius: 4, background: 'color-mix(in oklab, ' + ACCENT + ' 12%, transparent)', zIndex: 4 }} />
            )}

            {/* move-drag: breathing snap target at the slot the ghost will land on */}
            {moveDrag && moveHover && (() => {
              const rowIdx = rows.findIndex((rw) => rw.kind === 'tech' && rw.tech.id === moveHover.techId);
              if (rowIdx < 0) return null;
              const durH = moveRef.current ? moveRef.current.durationHours : 1;
              return <div className="cb-breathe" style={{ position: 'absolute', pointerEvents: 'none', top: rowIdx * ROW_H + 4, left: TECH_COL + hx(moveHover.startHour), width: durH * PX_PER_HOUR - 2, height: ROW_H - 8, border: `1.5px dashed ${ACCENT}`, borderRadius: 6, zIndex: 5 }} />;
            })()}

            {/* NOW line — the board's heartbeat; thick enough to find from across the office. */}
            {nowHour >= DAY_START && nowHour <= DAY_END && (
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: TECH_COL + hx(nowHour), width: 2.5, background: ACCENT, boxShadow: `0 0 8px 1px color-mix(in oklab, ${ACCENT} 55%, transparent)`, zIndex: 5, pointerEvents: 'none' }}>
                <span style={{ position: 'absolute', top: -1, left: -4, width: 10, height: 10, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 7px ${ACCENT}` }} />
                <span style={{ position: 'absolute', top: 2, left: 8, fontSize: 9, fontWeight: 800, color: '#fff', background: ACCENT, padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap' }}>now</span>
              </div>
            )}
            {!techs.length && <div className="muted" style={{ padding: 14, fontSize: 12 }}>No techs yet — add them on the Team screen (role = tech) so they show as rows here.</div>}
          </div>
        </div>
      </div>

      {/* (Jobs tray moved ABOVE the grid — the "Jobs to place" shelf. Nothing renders down here now.) */}
      {!tray.length && <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>📥 Every job is placed — nothing waiting for a tech or a time.</div>}

      {/* floating drag ghost — positioned imperatively (ref) so it tracks the cursor 1:1 with no lag */}
      {moveDrag && (() => {
        const j = jobs.find((x) => x.id === moveDrag.jobId); if (!j) return null;
        const m = moveRef.current;
        const target = techName(moveHover ? moveHover.techId : j.techId);
        return (
          <div ref={(el) => { ghostRef.current = el; positionGhost(); }}
            style={{ position: 'fixed', left: 0, top: 0, transform: `translate3d(${m ? m.lastX : 0}px, ${m ? m.lastY : 0}px, 0)`, willChange: 'transform', width: (m ? m.w : 120) - 2, minWidth: 96, height: ROW_H - 14, pointerEvents: 'none', zIndex: 9999, background: 'var(--surface-3)', border: `1px solid ${ACCENT}`, borderRadius: 5, padding: '3px 6px', overflow: 'hidden', boxShadow: '0 12px 28px rgba(0,0,0,.5)', opacity: 0.97 }}>
            <div style={{ fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.customer}</div>
            <div className="muted" style={{ fontSize: 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmtTime(j.scheduledISO)} <span style={{ color: ACCENT, fontWeight: 700 }}>→ {target || 'pick a tech'}</span></div>
          </div>
        );
      })()}

      {/* hover info card (desktop) — see the job without clicking */}
      {hover && (
        <div className="cb-hovercard" style={{ position: 'fixed', left: Math.min(hover.x + 14, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 250), top: hover.y + 14, zIndex: 80, width: 230, pointerEvents: 'none', background: 'var(--surface-1)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '10px 12px', boxShadow: '0 6px 20px rgba(0,0,0,.3)' }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>{hover.job.customer}{isLate(hover.job) && <span className="pill pill-red" style={{ marginLeft: 6, fontSize: 9 }}>LATE</span>}</div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>🕐 {fmtTime(hover.job.scheduledISO)} · {hover.job.duration_min || 60}m · <span style={{ textTransform: 'capitalize' }}>{String(hover.job.statusKey || 'scheduled').replace('_', ' ')}</span></div>
          {hover.job.address && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>📍 {hover.job.address}</div>}
          {(hover.job.job_type || hover.job.amount) && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>🔧 {[hover.job.job_type, hover.job.amount ? money(hover.job.amount) : null].filter(Boolean).join(' · ')}</div>}
          {techName(hover.job.techId) && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>👷 {techName(hover.job.techId)}</div>}
          {hover.job.phone && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>📞 {hover.job.phone}</div>}
          <div className="muted" style={{ fontSize: 10, marginTop: 6, opacity: 0.7 }}>{canAssign ? 'drag = move · ' : ''}click = details · right-click = actions</div>
        </div>
      )}

      {sel && <JobPanel job={sel} techName={techName(sel.techId)} techs={techs} canStatus={canStatus} canAssign={canAssign} onClose={() => setSel(null)} />}
      <ContextMenu menu={menu} onClose={() => setMenu(null)} onAction={onMenuAction} canMutate={canStatus || canAssign} />
      {cancelT && <CancelModal job={cancelT} onClose={() => setCancelT(null)} onDone={() => { setCancelT(null); refresh(); }} />}
      {durT && <DurationModal job={durT} onClose={() => setDurT(null)} onDone={() => { setDurT(null); refresh(); }} />}
      {addT && <AddTechModal job={addT.job} kind={addT.kind} techs={techs} onClose={() => setAddT(null)} onDone={() => { setAddT(null); refresh(); }} />}
    </>
  );
}

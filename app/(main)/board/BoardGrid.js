'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assignTech, updateJobStatus, setDuration } from './actions';
import { ACCENT, STATUS_DOT, crewColor, initials, priorityOf, hourLabel, money, fmtTime } from './boardTokens';
import JobPanel from './JobPanel';
import { ContextMenu, CancelModal, DurationModal } from './JobActions';

// Layout — absolute px-per-hour grid, the same model the live board uses so the now-line and
// drop-targeting are computed straight from mouse position.
const TECH_COL = 150, HEADER_H = 30, ROW_H = 50, PX_PER_HOUR = 58, HOURS = 24;
const GRID_W = HOURS * PX_PER_HOUR;

// fractional hour (0–24) of an ISO time, in the VIEWER's local timezone (so placement matches the
// times shown on the cards — both use the browser clock, not Vercel's UTC).
function startHourOf(iso) { try { const d = new Date(iso); return d.getHours() + d.getMinutes() / 60; } catch { return 0; } }

export default function BoardGrid({ techs, jobs, tray, techStatus, canAssign, canStatus }) {
  // "now" in the browser's timezone, re-checked each minute so the now-line tracks the real clock.
  const [nowHour, setNowHour] = useState(() => { const n = new Date(); return n.getHours() + n.getMinutes() / 60; });
  useEffect(() => { const id = setInterval(() => { const n = new Date(); setNowHour(n.getHours() + n.getMinutes() / 60); }, 30000); return () => clearInterval(id); }, []);
  const router = useRouter();
  const gridRef = useRef(null);
  const bodyRef = useRef(null);
  const [pending, start] = useTransition();
  const [drop, setDrop] = useState(null); // { rowIdx, hour } live drop indicator
  const [sel, setSel] = useState(null);   // selected job → detail panel
  const [menu, setMenu] = useState(null); // {x,y,job} right-click menu
  const [cancelT, setCancelT] = useState(null);
  const [durT, setDurT] = useState(null);
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
  }, [router]);

  // right-click menu actions
  const STATUS_OF = { enroute: 'enroute', onsite: 'on_site', done: 'done' };
  function onMenuAction(id) {
    const j = menu && menu.job; setMenu(null);
    if (!j) return;
    if (id === 'open' || id === 'reassign') setSel(j);
    else if (id === 'duration') setDurT(j);
    else if (id === 'cancel') setCancelT(j);
    else if (id === 'call') { if (j.phone) window.open('tel:' + String(j.phone).replace(/[^0-9+]/g, '')); }
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

  // index grid jobs by techId
  const byTech = {};
  jobs.forEach((j) => { (byTech[j.techId] = byTech[j.techId] || []).push(j); });

  // auto-center on "now" once on mount
  const didScroll = useRef(false);
  useEffect(() => {
    if (didScroll.current) return;
    const g = gridRef.current; if (!g) return;
    didScroll.current = true;
    const n = new Date(); const h = n.getHours() + n.getMinutes() / 60;
    const laneW = g.clientWidth - TECH_COL;
    g.scrollLeft = Math.max(0, (h - 1) * PX_PER_HOUR - laneW / 3);
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
    const hour = Math.max(0, Math.min(23.75, Math.round((x / PX_PER_HOUR) * 4) / 4)); // snap 15-min
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

  // hour lines (stronger) + 15-min slot lines (lighter) — matches the live board's slotMinutes:15
  const QUARTER = PX_PER_HOUR / 4;
  const laneBg = `repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px ${PX_PER_HOUR}px), repeating-linear-gradient(to right, color-mix(in oklab, var(--border) 45%, transparent) 0 1px, transparent 1px ${QUARTER}px)`;
  const Dot = ({ k }) => <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[k] || 'var(--fg-3)', display: 'inline-block' }} />;

  function JobBlock({ j, draggable }) {
    const pr = priorityOf(j.priority);
    const left = startHourOf(j.scheduledISO) * PX_PER_HOUR;
    const live = resizeView && resizeView.jobId === j.id;
    const dur = live ? resizeView.curDur : (j.duration_min || 60);
    const width = Math.max(22, (dur / 60) * PX_PER_HOUR - 2);
    const canResize = (canStatus || canAssign) && j.statusKey !== 'done';
    return (
      <div
        draggable={draggable}
        onDragStart={draggable ? (e) => { if (suppressDrag.current) { e.preventDefault(); return; } dragStart(e, j.id); } : undefined}
        onClick={() => { if (didResize.current) { didResize.current = false; return; } setSel(j); }}
        onContextMenu={(e) => openMenu(e, j)}
        title={`${j.customer} · ${fmtTime(j.scheduledISO)} · ${dur}m${j.job_type ? ' · ' + j.job_type : ''} · click for details · right-click for actions`}
        style={{
          position: 'absolute', left, top: 5, height: ROW_H - 14, width,
          background: live ? 'color-mix(in oklab, var(--accent) 14%, var(--surface-2))' : 'var(--surface-2)',
          borderLeft: `3px solid ${pr ? pr.color : STATUS_DOT[j.statusKey]}`,
          borderRadius: 4, padding: '3px 5px', overflow: 'hidden', cursor: 'pointer', zIndex: live ? 5 : 2,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {pr && <span style={{ color: pr.color, fontWeight: 800 }}>{pr.short} </span>}{j.customer}
        </div>
        <div className="muted" style={{ fontSize: 9 }}>{fmtTime(j.scheduledISO)}{live ? ` · ${dur}m` : (j.amount ? ' · ' + money(j.amount) : '')}</div>
        {canResize && (
          <div onMouseDown={(e) => beginResize(e, j)} title="Drag to set how long it'll take"
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', zIndex: 6 }} />
        )}
      </div>
    );
  }

  return (
    <>
      <div ref={gridRef} style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
        <div style={{ minWidth: TECH_COL + GRID_W }}>
          {/* hour header */}
          <div style={{ display: 'flex', height: HEADER_H, borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: TECH_COL, flexShrink: 0, position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 3, fontSize: 11, fontWeight: 700, color: 'var(--fg-3)', display: 'flex', alignItems: 'center', padding: '0 10px' }}>Tech</div>
            <div style={{ position: 'relative', width: GRID_W }}>
              {Array.from({ length: HOURS }, (_, h) => (
                <div key={h} style={{ position: 'absolute', left: h * PX_PER_HOUR, top: 0, bottom: 0, width: PX_PER_HOUR, textAlign: 'center', fontSize: 10, color: h === Math.floor(nowHour) ? ACCENT : 'var(--fg-3)', fontWeight: h === Math.floor(nowHour) ? 800 : 400, lineHeight: `${HEADER_H}px`, borderLeft: '1px solid var(--border)' }}>{hourLabel(h)}</div>
              ))}
            </div>
          </div>

          {/* body (drop zone) */}
          <div ref={bodyRef} onDragOver={onDragOver} onDrop={onDrop} onDragLeave={() => setDrop(null)} style={{ position: 'relative' }}>
            {rows.map((row, i) => {
              if (row.kind === 'crew') {
                return (
                  <div key={'c' + i} style={{ display: 'flex', height: ROW_H, alignItems: 'center', background: 'var(--surface-1)', borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${crewColor(row.name)}` }}>
                    <div style={{ width: TECH_COL, flexShrink: 0, position: 'sticky', left: 0, background: 'var(--surface-1)', zIndex: 3, padding: '0 10px', fontSize: 11, fontWeight: 800, color: crewColor(row.name) }}>▾ {row.name}</div>
                    <div style={{ flex: 1 }} />
                  </div>
                );
              }
              const t = row.tech; const st = techStatus[t.id];
              return (
                <div key={t.id} style={{ display: 'flex', height: ROW_H, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: TECH_COL, flexShrink: 0, position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 3, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderRight: '1px solid var(--border)' }}>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: crewColor(t.crew || 'Crew'), color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(t.name)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                      <span style={{ fontSize: 9, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--fg-3)' }}>{st ? <><Dot k={st} /> {st}</> : 'idle'}</span>
                    </span>
                  </div>
                  <div style={{ position: 'relative', width: GRID_W, backgroundImage: laneBg }}>
                    {(byTech[t.id] || []).map((j) => <JobBlock key={j.id} j={j} draggable={canAssign} />)}
                  </div>
                </div>
              );
            })}

            {/* drop indicator */}
            {drop && (
              <div style={{ position: 'absolute', pointerEvents: 'none', top: drop.rowIdx * ROW_H + 4, left: TECH_COL + drop.hour * PX_PER_HOUR, width: PX_PER_HOUR * 0.92, height: ROW_H - 8, border: `2px dashed ${ACCENT}`, borderRadius: 4, background: 'color-mix(in oklab, ' + ACCENT + ' 12%, transparent)', zIndex: 4 }} />
            )}

            {/* NOW line */}
            {nowHour >= 0 && nowHour <= 24 && (
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: TECH_COL + nowHour * PX_PER_HOUR, width: 2, background: ACCENT, zIndex: 5, pointerEvents: 'none' }}>
                <span style={{ position: 'absolute', top: -1, left: -4, width: 9, height: 9, borderRadius: '50%', background: ACCENT }} />
                <span style={{ position: 'absolute', top: 2, left: 7, fontSize: 9, fontWeight: 800, color: '#fff', background: ACCENT, padding: '1px 4px', borderRadius: 4, whiteSpace: 'nowrap' }}>now</span>
              </div>
            )}
            {!techs.length && <div className="muted" style={{ padding: 14, fontSize: 12 }}>No techs yet — add them on the Team screen (role = tech) so they show as rows here.</div>}
          </div>
        </div>
      </div>

      {/* JOBS TRAY — drag a card onto a tech row above */}
      <h3 style={{ margin: '18px 0 8px', fontSize: 12, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        🧰 Jobs Tray <span className="muted" style={{ fontWeight: 400 }}>· {tray.length}{canAssign ? ' · drag onto a tech' : ''}</span>
      </h3>
      {!tray.length && <div className="card"><span className="muted">Tray is empty — every job is on a tech&apos;s schedule. 🎉</span></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, opacity: pending ? 0.6 : 1 }}>
        {tray.map((j) => {
          const pr = priorityOf(j.priority);
          const typeBits = [j.job_type, j.amount ? money(j.amount) : null].filter(Boolean).join(' · ');
          return (
            <div key={j.id} draggable={canAssign} onDragStart={canAssign ? (e) => dragStart(e, j.id) : undefined}
              onClick={() => setSel(j)} onContextMenu={(e) => openMenu(e, j)}
              className="card" style={{ borderLeft: `3px solid ${pr ? pr.color : (j.techId ? ACCENT : 'var(--red)')}`, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{pr && <span style={{ color: pr.color, fontWeight: 800 }}>{pr.short} </span>}{j.customer}</span>
                <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{j.scheduledISO ? fmtTime(j.scheduledISO) : 'no time'}</span>
              </div>
              {j.address && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>📍 {j.address}</div>}
              {typeBits && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>🔧 {typeBits}</div>}
            </div>
          );
        })}
      </div>

      {sel && <JobPanel job={sel} techName={techName(sel.techId)} canStatus={canStatus} canAssign={canAssign} onClose={() => setSel(null)} />}
      <ContextMenu menu={menu} onClose={() => setMenu(null)} onAction={onMenuAction} canMutate={canStatus || canAssign} />
      {cancelT && <CancelModal job={cancelT} onClose={() => setCancelT(null)} onDone={() => { setCancelT(null); refresh(); }} />}
      {durT && <DurationModal job={durT} onClose={() => setDurT(null)} onDone={() => { setDurT(null); refresh(); }} />}
    </>
  );
}

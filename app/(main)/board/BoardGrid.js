'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assignTech } from './actions';
import { ACCENT, STATUS_DOT, crewColor, initials, priorityOf, hourLabel, money, fmtTime } from './boardTokens';
import JobPanel from './JobPanel';

// Layout — absolute px-per-hour grid, the same model the live board uses so the now-line and
// drop-targeting are computed straight from mouse position.
const TECH_COL = 150, HEADER_H = 30, ROW_H = 50, PX_PER_HOUR = 58, HOURS = 24;
const GRID_W = HOURS * PX_PER_HOUR;

export default function BoardGrid({ techs, jobs, tray, techStatus, nowHour, canAssign, canStatus }) {
  const router = useRouter();
  const gridRef = useRef(null);
  const bodyRef = useRef(null);
  const [pending, start] = useTransition();
  const [drop, setDrop] = useState(null); // { rowIdx, hour } live drop indicator
  const [sel, setSel] = useState(null);   // selected job → detail panel
  const techName = (id) => { const t = techs.find((x) => x.id === id); return t ? t.name : ''; };

  // group techs into crews → flat render rows (crew header rows keep the floor(y/ROW_H) math valid)
  const crews = {};
  techs.forEach((t) => { const c = t.crew || 'Crew'; (crews[c] = crews[c] || []).push(t); });
  const rows = [];
  Object.keys(crews).sort().forEach((c) => { rows.push({ kind: 'crew', name: c }); crews[c].forEach((t) => rows.push({ kind: 'tech', tech: t })); });
  const techAtRow = (i) => (rows[i] && rows[i].kind === 'tech' ? rows[i].tech : null);

  // index grid jobs by techId
  const byTech = {};
  jobs.forEach((j) => { (byTech[j.techId] = byTech[j.techId] || []).push(j); });

  // auto-center on "now" once
  useEffect(() => {
    const g = gridRef.current; if (!g) return;
    const laneW = g.clientWidth - TECH_COL;
    g.scrollLeft = Math.max(0, (nowHour - 1) * PX_PER_HOUR - laneW / 3);
  }, [nowHour]);

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
    start(async () => { await assignTech(jobId, loc.techId, loc.hour); router.refresh(); });
  }
  function dragStart(e, jobId) { e.dataTransfer.setData('text/job-id', jobId); e.dataTransfer.effectAllowed = 'move'; }

  const laneBg = `repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px ${PX_PER_HOUR}px)`;
  const Dot = ({ k }) => <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[k] || 'var(--fg-3)', display: 'inline-block' }} />;

  function JobBlock({ j, draggable }) {
    const pr = priorityOf(j.priority);
    const left = j.startHour * PX_PER_HOUR;
    return (
      <div
        draggable={draggable}
        onDragStart={draggable ? (e) => dragStart(e, j.id) : undefined}
        onClick={() => setSel(j)}
        title={`${j.customer} · ${fmtTime(j.scheduledISO)}${j.job_type ? ' · ' + j.job_type : ''} · click for details`}
        style={{
          position: 'absolute', left, top: 5, height: ROW_H - 14, width: PX_PER_HOUR * 0.92,
          background: 'var(--surface-2)', borderLeft: `3px solid ${pr ? pr.color : STATUS_DOT[j.statusKey]}`,
          borderRadius: 4, padding: '3px 5px', overflow: 'hidden', cursor: 'pointer', zIndex: 2,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {pr && <span style={{ color: pr.color, fontWeight: 800 }}>{pr.short} </span>}{j.customer}
        </div>
        <div className="muted" style={{ fontSize: 9 }}>{fmtTime(j.scheduledISO)}{j.amount ? ' · ' + money(j.amount) : ''}</div>
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
              onClick={() => setSel(j)}
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
    </>
  );
}

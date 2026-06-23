'use client';

// Client surface for the board: owns the active view, the search query, and the status filter.
// Renders (top → bottom, dispatch priority first):
//   1. Ops strip   — Late / Unassigned / On site / En route (the "who needs me now" glance)
//   2. Search      — customer / address / phone / job # / tech / status
//   3. Filter chips — All / Idle / En route / On site / Late / Complete (clickable, with counts)
//   4. View tabs    — Time grid / Map / Roster / Week / Capacity
// Search + chips filter the jobs/tray passed down to the grid and the secondary views.

import { useMemo, useState } from 'react';
import BoardGrid from './BoardGrid';
import JobPanel from './JobPanel';
import { MapView, RosterView, WeekView, CapacityView } from './BoardViews';
import { ACCENT, STATUS_DOT } from './boardTokens';
import { Search, X, TriangleAlert, Inbox, House, Navigation } from 'lucide-react';

const TABS = [
  { k: 'grid', label: 'Time grid' },
  { k: 'map', label: 'Map' },
  { k: 'roster', label: 'Roster' },
  { k: 'week', label: 'Week' },
  { k: 'capacity', label: 'Capacity' },
];
// A job is late if its start has passed and it isn't already rolling/on-site/done.
const isLateJob = (j) => !['enroute', 'onsite', 'done'].includes(j.statusKey) && j.scheduledISO && new Date(j.scheduledISO) < new Date();

function matchStatus(j, f) {
  if (f === 'all') return true;
  if (f === 'unassigned') return !j.techId;
  const late = isLateJob(j);
  if (f === 'late') return late;
  if (late) return false; // a late job only shows under "Late", not its raw status
  return j.statusKey === f; // 'scheduled' (Idle) / enroute / onsite / done
}
function matchQuery(j, q, techName) {
  if (!q) return true;
  const hay = [j.customer, j.address, j.phone, j.job_number, techName(j.techId), j.statusKey, j.job_type].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

export default function BoardSurface({ techs, jobs, tray, techStatus, canAssign, canStatus, dateStr }) {
  const [view, setView] = useState('grid');
  const [sel, setSel] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const techsWithStatus = useMemo(() => techs.map((t) => ({ ...t, status: techStatus[t.id] || 'scheduled' })), [techs, techStatus]);
  const techNameById = useMemo(() => { const m = {}; techs.forEach((t) => { m[t.id] = t.name; }); return m; }, [techs]);
  const techName = (id) => techNameById[id] || '';

  // counts off the FULL day set (so chips/ops show totals regardless of the active filter)
  const everything = useMemo(() => [...jobs, ...tray], [jobs, tray]);
  const counts = useMemo(() => {
    const c = { all: everything.length, scheduled: 0, enroute: 0, onsite: 0, late: 0, done: 0, unassigned: 0, noTime: 0 };
    everything.forEach((j) => {
      if (isLateJob(j)) c.late++; else c[j.statusKey] = (c[j.statusKey] || 0) + 1;
      if (!j.techId) c.unassigned++;
      if (!j.scheduledISO) c.noTime++;
    });
    return c;
  }, [everything]);

  const fJobs = useMemo(() => jobs.filter((j) => matchStatus(j, statusFilter) && matchQuery(j, query, techName)), [jobs, statusFilter, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const fTray = useMemo(() => tray.filter((j) => matchStatus(j, statusFilter) && matchQuery(j, query, techName)), [tray, statusFilter, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const weekJobs = useMemo(() => [...fJobs, ...fTray], [fJobs, fTray]);

  const toggle = (f) => setStatusFilter((cur) => (cur === f ? 'all' : f));

  // ── ops strip cell ──
  const Op = ({ icon, label, n, tone, filter }) => {
    const active = statusFilter === filter;
    const col = tone === 'red' ? 'var(--red)' : tone === 'green' ? 'var(--green)' : tone === 'blue' ? 'var(--info-text)' : 'var(--fg-2)';
    return (
      <button onClick={() => toggle(filter)} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
        border: `1px solid ${active ? col : 'var(--border)'}`, background: active ? `color-mix(in oklab, ${col} 14%, var(--surface-1))` : 'var(--surface-1)',
      }}>
        {icon}
        <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: n ? col : 'var(--fg-3)', lineHeight: 1 }}>{n}</span>
        <span style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
      </button>
    );
  };
  // ── filter chip ──
  const Chip = ({ f, label, k }) => {
    const active = statusFilter === f;
    const n = k ? counts[k] : counts.all;
    return (
      <button onClick={() => toggle(f)} className="pill" style={{
        cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5,
        border: active ? `1px solid ${ACCENT}` : '1px solid transparent',
        background: active ? `color-mix(in oklab, ${ACCENT} 16%, var(--surface-2))` : 'var(--surface-2)',
        color: active ? 'var(--fg-1)' : 'var(--fg-2)', fontWeight: active ? 800 : 600,
      }}>
        {k && k !== 'all' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[k === 'scheduled' ? 'scheduled' : k] || 'var(--fg-3)', display: 'inline-block' }} />}
        {label} <strong>{n}</strong>
      </button>
    );
  };

  return (
    <>
      {/* 1. ops strip — first screen priority */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <Op icon={<TriangleAlert size={18} style={{ color: counts.late ? 'var(--red)' : 'var(--fg-3)' }} />} label="Late" n={counts.late} tone="red" filter="late" />
        <Op icon={<Inbox size={18} style={{ color: counts.unassigned ? 'var(--fg-2)' : 'var(--fg-3)' }} />} label="Unassigned" n={counts.unassigned} tone="amber" filter="unassigned" />
        <Op icon={<House size={18} style={{ color: counts.onsite ? 'var(--green)' : 'var(--fg-3)' }} />} label="On site" n={counts.onsite} tone="green" filter="onsite" />
        <Op icon={<Navigation size={18} style={{ color: counts.enroute ? 'var(--info-text)' : 'var(--fg-3)' }} />} label="En route" n={counts.enroute} tone="blue" filter="enroute" />
      </div>

      {/* 2. search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 8px' }}>
        <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: 440 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-3)' }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customer, address, phone, job #, tech, status…"
            style={{ width: '100%', padding: '9px 30px 9px 32px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontSize: 13 }} />
          {query && <button onClick={() => setQuery('')} aria-label="Clear search" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', display: 'flex' }}><X size={15} /></button>}
        </div>
        {(query || statusFilter !== 'all') && <span className="muted" style={{ fontSize: 11 }}>{fJobs.length + fTray.length} of {counts.all} shown</span>}
      </div>

      {/* 3. clickable status chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <Chip f="all" label="All" k="all" />
        <Chip f="scheduled" label="Idle" k="scheduled" />
        <Chip f="enroute" label="En route" k="enroute" />
        <Chip f="onsite" label="On site" k="onsite" />
        <Chip f="late" label="Late" k="late" />
        <Chip f="done" label="Complete" k="done" />
        {/* 4. view tabs */}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {TABS.map((t) => {
            const active = view === t.k;
            return <button key={t.k} onClick={() => setView(t.k)} className="pill" style={{ cursor: 'pointer', border: 'none', fontSize: 11, fontWeight: active ? 800 : 600, background: active ? ACCENT : 'var(--surface-2)', color: active ? '#fff' : 'var(--fg-3)' }}>{t.label}</button>;
          })}
        </span>
      </div>

      {view === 'grid' ? (
        <BoardGrid techs={techs} jobs={fJobs} tray={fTray} techStatus={techStatus} canAssign={canAssign} canStatus={canStatus} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'min(660px, 72vh)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {view === 'map' && <MapView techs={techsWithStatus} jobs={fJobs} onSelectJob={setSel} />}
          {view === 'roster' && <RosterView techs={techsWithStatus} jobs={fJobs} onSelectJob={setSel} />}
          {view === 'week' && <WeekView jobs={weekJobs} onSelectJob={setSel} />}
          {view === 'capacity' && <CapacityView techs={techsWithStatus} jobs={fJobs} />}
        </div>
      )}

      {sel && <JobPanel job={sel} techName={techName(sel.techId)} techs={techs} canStatus={canStatus} canAssign={canAssign} onClose={() => setSel(null)} />}
    </>
  );
}

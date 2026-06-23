'use client';

// Client tab switcher for the Dispatch Live board. Owns the active-view state so the
// Time grid / Map / Roster / Week / Capacity pills actually switch (they were dead labels
// before). The grid keeps its own job-panel; the secondary views open the same JobPanel here.

import { useMemo, useState } from 'react';
import BoardGrid from './BoardGrid';
import JobPanel from './JobPanel';
import { MapView, RosterView, WeekView, CapacityView } from './BoardViews';
import { ACCENT } from './boardTokens';

const TABS = [
  { k: 'grid', label: 'Time grid' },
  { k: 'map', label: 'Map' },
  { k: 'roster', label: 'Roster' },
  { k: 'week', label: 'Week' },
  { k: 'capacity', label: 'Capacity' },
];

export default function BoardSurface({ techs, jobs, tray, techStatus, canAssign, canStatus }) {
  const [view, setView] = useState('grid');
  const [sel, setSel] = useState(null); // job selected from a secondary view

  // attach each tech's worst-status (the grid passes this in as a map)
  const techsWithStatus = useMemo(
    () => techs.map((t) => ({ ...t, status: techStatus[t.id] || 'scheduled' })),
    [techs, techStatus]
  );
  const weekJobs = useMemo(() => [...jobs, ...tray], [jobs, tray]);
  const techName = (id) => { const t = techs.find((x) => x.id === id); return t ? t.name : ''; };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, margin: '0 0 10px' }}>
        {TABS.map((t) => {
          const active = view === t.k;
          return (
            <button key={t.k} onClick={() => setView(t.k)} className="pill"
              style={{ cursor: 'pointer', border: 'none', fontSize: 11, fontWeight: active ? 800 : 600, background: active ? ACCENT : 'var(--surface-2)', color: active ? '#fff' : 'var(--fg-3)' }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {view === 'grid' ? (
        <BoardGrid techs={techs} jobs={jobs} tray={tray} techStatus={techStatus} canAssign={canAssign} canStatus={canStatus} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'min(660px, 72vh)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {view === 'map' && <MapView techs={techsWithStatus} jobs={jobs} onSelectJob={setSel} />}
          {view === 'roster' && <RosterView techs={techsWithStatus} jobs={jobs} onSelectJob={setSel} />}
          {view === 'week' && <WeekView jobs={weekJobs} onSelectJob={setSel} />}
          {view === 'capacity' && <CapacityView techs={techsWithStatus} jobs={jobs} />}
        </div>
      )}

      {sel && <JobPanel job={sel} techName={techName(sel.techId)} techs={techs} canStatus={canStatus} canAssign={canAssign} onClose={() => setSel(null)} />}
    </>
  );
}

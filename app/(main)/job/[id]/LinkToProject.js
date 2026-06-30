'use client';

// Cockpit control to make this job a VISIT on a project: pick a project + unit → links it so it rolls up
// into that project's margin and shows under the unit. Lazy-loads the project list only when opened.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { listProjectsWithUnits, linkJobToUnit, flagProjectCandidate } from '../../projects/actions';

export default function LinkToProject({ jobId, currentProjectId, currentProjectName, currentUnitLabel, canLink = false, rollSignal = 0, rollThreshold = 3, totalRolls = 0 }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState(null);
  const [pid, setPid] = useState(currentProjectId || '');
  const [uid, setUid] = useState('');
  const [err, setErr] = useState(null);
  const [flagMsg, setFlagMsg] = useState(null);
  const flag = () => start(async () => { const r = await flagProjectCandidate(jobId, ''); setFlagMsg(r.ok ? r.msg : (r.msg || 'Could not flag.')); });
  // Auto-detected: rolled enough times (NOT counting parts waits) that it's probably a multi-day project.
  const triggered = !currentProjectId && rollSignal >= rollThreshold;

  // Tech view: can't move jobs — show the linkage read-only, or a "flag for a manager" nudge.
  if (!canLink) {
    if (currentProjectId) return (
      <div className="card" style={{ marginTop: 8, borderLeft: '3px solid var(--purple)' }}>
        <span style={{ fontWeight: 800, fontSize: 13 }}>🏗️ Part of <a href={`/projects/${currentProjectId}`} style={{ color: 'var(--purple)' }}>{currentProjectName || 'a project'}</a>{currentUnitLabel ? ` · ${currentUnitLabel}` : ''}</span>
      </div>
    );
    return (
      <div className="card" style={{ marginTop: 8, borderLeft: '3px solid ' + (triggered ? 'var(--amber)' : 'var(--purple)'), background: triggered ? 'rgba(255,179,0,0.08)' : undefined }}>
        {triggered && <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--amber)', marginBottom: 4 }}>🏗️ Rolled {totalRolls}× — looks like a multi-day project</div>}
        {triggered && <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>Come back {rollSignal} time{rollSignal === 1 ? '' : 's'} for more work (parts waits don’t count). Flag it so a manager sets it up as a project.</div>}
        {flagMsg ? <span style={{ fontSize: 12.5, color: 'var(--green)' }}>✓ {flagMsg}</span>
          : <button onClick={flag} disabled={pending} style={{ background: 'none', border: 'none', color: triggered ? 'var(--amber)' : 'var(--purple)', cursor: 'pointer', fontSize: 13, fontWeight: 800, padding: 0 }}>{pending ? 'Flagging…' : (triggered ? '🏗️ Flag this project for a manager' : '🏗️ Looks like part of a bigger project? Flag it for a manager')}</button>}
      </div>
    );
  }

  const openPicker = () => {
    setOpen(true); setErr(null);
    if (!projects) start(async () => { const r = await listProjectsWithUnits(); setProjects(r.projects || []); });
  };
  const save = () => { setErr(null); start(async () => { const r = await linkJobToUnit(pid || null, uid || null, jobId); if (r.ok) { setOpen(false); router.refresh(); } else setErr(r.msg); }); };
  const unlink = () => start(async () => { await linkJobToUnit(null, null, jobId); router.refresh(); });

  const units = (projects || []).find((p) => p.id === pid)?.units || [];
  const sel = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 13 };

  return (
    <div className="card" style={{ marginTop: 8, borderLeft: '3px solid ' + (triggered ? 'var(--amber)' : 'var(--purple)'), background: triggered && !open ? 'rgba(255,179,0,0.08)' : undefined }}>
      {triggered && !open && <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--amber)', marginBottom: 6 }}>🏗️ Rolled {totalRolls}× (not counting parts) — looks like a multi-day project. Link it so its visits + margin roll up.</div>}
      {currentProjectId && !open ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>🏗️ Part of <a href={`/projects/${currentProjectId}`} style={{ color: 'var(--purple)' }}>{currentProjectName || 'a project'}</a></span>
          {currentUnitLabel && <span className="pill" style={{ fontSize: 10 }}>{currentUnitLabel}</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button onClick={openPicker} style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>change</button>
            <button onClick={unlink} disabled={pending} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 12 }}>unlink</button>
          </span>
        </div>
      ) : !open ? (
        <button onClick={openPicker} style={{ background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: 13, fontWeight: 800, padding: 0 }}>🏗️ ＋ Link this job to a project</button>
      ) : (
        <div>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Link to a project</div>
          {projects === null ? <span className="muted" style={{ fontSize: 12 }}>Loading projects…</span> : projects.length === 0 ? <span className="muted" style={{ fontSize: 12 }}>No projects yet — create one under Customers → Projects.</span> : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={pid} onChange={(e) => { setPid(e.target.value); setUid(''); }} style={{ ...sel, flex: '1 1 180px' }}>
                <option value="">— project —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={uid} onChange={(e) => setUid(e.target.value)} disabled={!pid} style={{ ...sel, flex: '1 1 140px' }}>
                <option value="">— unit (optional) —</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
            </div>
          )}
          {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={save} disabled={pending || !pid} className="btn" style={{ opacity: (pending || !pid) ? 0.6 : 1 }}>{pending ? '…' : 'Link'}</button>
            <button onClick={() => setOpen(false)} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'var(--fg-2)', borderRadius: 8, padding: '0 14px', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

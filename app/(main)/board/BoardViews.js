'use client';

// Secondary board views — Map / Roster / Week / Capacity — ported from the live board's
// dispatchboard_views.html, rebound to the web's real Supabase shape:
//   tech = { id, name, crew, status }   job = { id, customer, address, job_number,
//   duration_min, statusKey, priority, amount, job_type, scheduledISO, techId }
// The live prototype keyed Map/Heatmap off a `zone` field that doesn't exist in our data, so we
// group by CREW instead (the dimension we actually have) and keep the live visual language.

import { ACCENT, STATUS_DOT, crewColor, money, fmtTime, initials } from './boardTokens';

// ── shared helpers ──────────────────────────────────────────────────────────
const STATUS_LABEL = { scheduled: 'Scheduled', enroute: 'En route', onsite: 'On site', hold: 'On hold', done: 'Complete', late: 'Late' };
const startHourOf = (iso) => { try { const d = new Date(iso); return d.getHours() + d.getMinutes() / 60; } catch { return 0; } };
const durHours = (j) => (j.duration_min || 60) / 60;
const endHourOf = (j) => startHourOf(j.scheduledISO) + durHours(j);
const isEmerg = (j) => /emerg/i.test(j.priority || '');
const isActive = (sk) => sk === 'onsite' || sk === 'enroute' || sk === 'late';
const jobColor = (j) => (isEmerg(j) ? STATUS_DOT.late : (STATUS_DOT[j.statusKey] || 'var(--fg-3)'));
const jobLabel = (j) => j.job_number || String(j.customer || 'Job').split(/\s+/)[0];

// distribute crews as labeled clusters on the abstract map (no GPS in our data yet)
function crewCoords(crews) {
  const m = {};
  crews.forEach((c, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    m[c] = { x: Math.min(0.85, 0.18 + col * 0.32), y: Math.min(0.85, 0.24 + row * 0.30) };
  });
  return m;
}
const spread = (id, mul, span) => ((((id || '  ').charCodeAt(1) + (id || '   ').charCodeAt(2)) * mul) % span - span / 2) / 800;

const Avatar = ({ tech, size = 28 }) => (
  <span style={{ width: size, height: size, borderRadius: '50%', background: crewColor(tech.crew || 'Crew'), color: '#fff', fontSize: size * 0.36, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'var(--mono)' }}>{initials(tech.name)}</span>
);
const StatusDot = ({ k, size = 6 }) => <span style={{ width: size, height: size, borderRadius: '50%', background: STATUS_DOT[k] || 'var(--fg-3)', display: 'inline-block', flexShrink: 0 }} />;
const StatusPill = ({ status }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 9, background: 'var(--surface-2)', color: 'var(--fg-2)' }}>
    <StatusDot k={status} size={6} />{STATUS_LABEL[status] || 'Idle'}
  </span>
);
const Stat = ({ label, value }) => (
  <div style={{ background: 'var(--surface-2)', borderRadius: 5, padding: '6px 8px' }}>
    <div style={{ fontSize: 9.5, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>{value}</div>
  </div>
);
const SectionHeader = ({ children }) => (
  <div style={{ padding: '9px 12px', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-3)', borderBottom: '1px solid var(--border)' }}>{children}</div>
);

// ── MAP VIEW ────────────────────────────────────────────────────────────────
export function MapView({ techs, jobs, onSelectJob }) {
  const crews = [...new Set(techs.map((t) => t.crew || 'Crew'))];
  const coords = crewCoords(crews);
  const crewOfTech = {}; techs.forEach((t) => { crewOfTech[t.id] = t.crew || 'Crew'; });
  const pinJobs = jobs.filter((j) => j.techId && coords[crewOfTech[j.techId]] && ['onsite', 'enroute', 'scheduled', 'late'].includes(j.statusKey));

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div style={{ flex: 1, position: 'relative', background: 'var(--map-bg)', overflow: 'hidden' }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
          <defs>
            <pattern id="mapgrid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="var(--border)" strokeWidth="0.5" /></pattern>
            <pattern id="mapgridminor" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="var(--border-soft)" strokeWidth="0.5" /></pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#mapgridminor)" />
          <rect width="100%" height="100%" fill="url(#mapgrid)" />
        </svg>
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} preserveAspectRatio="none" viewBox="0 0 100 100">
          <path d="M0 50 L100 50" stroke="var(--border-strong)" strokeWidth="0.4" />
          <path d="M50 0 L50 100" stroke="var(--border-strong)" strokeWidth="0.4" />
          <path d="M0 25 L100 22" stroke="var(--border)" strokeWidth="0.25" />
          <path d="M0 75 L100 78" stroke="var(--border)" strokeWidth="0.25" />
          <path d="M25 0 L22 100" stroke="var(--border)" strokeWidth="0.25" />
          <path d="M75 0 L78 100" stroke="var(--border)" strokeWidth="0.25" />
          <path d="M10 90 Q40 60 60 70 T100 30" stroke="var(--accent-3)" strokeWidth="0.5" fill="none" opacity="0.3" />
        </svg>

        {/* crew cluster labels */}
        {crews.map((c) => coords[c] && (
          <div key={c} style={{ position: 'absolute', left: `${coords[c].x * 100}%`, top: `${coords[c].y * 100 - 13}%`, transform: 'translateX(-50%)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: crewColor(c), pointerEvents: 'none' }}>{c}</div>
        ))}

        {/* job pins, clustered near their crew */}
        {pinJobs.map((j) => {
          const c = coords[crewOfTech[j.techId]];
          const x = (c.x + spread(j.id, 13, 80)) * 100, y = (c.y + spread(j.id, 17, 80)) * 100;
          return (
            <button key={j.id} onClick={() => onSelectJob(j)} title={`${j.customer} · ${STATUS_LABEL[j.statusKey] || ''}`} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -100%)', padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
              <MapPin job={j} />
            </button>
          );
        })}

        {/* tech pucks at their crew cluster */}
        {techs.map((t) => {
          const c = coords[t.crew || 'Crew']; if (!c) return null;
          return (
            <div key={t.id} style={{ position: 'absolute', left: `${(c.x + spread(t.id, 23, 60)) * 100}%`, top: `${(c.y + spread(t.id, 19, 60)) * 100}%`, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: crewColor(t.crew || 'Crew'), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, fontFamily: 'var(--mono)', boxShadow: '0 2px 8px rgba(0,0,0,0.3), 0 0 0 3px var(--map-bg)' }}>{initials(t.name)}</div>
            </div>
          );
        })}
      </div>

      {/* right rail — who's active in the field right now */}
      <div style={{ width: 260, borderLeft: '1px solid var(--border)', background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <SectionHeader>Active in field</SectionHeader>
        <div style={{ overflow: 'auto', flex: 1 }}>
          {techs.filter((t) => isActive(t.status)).map((t) => {
            const cur = jobs.find((j) => j.techId === t.id && isActive(j.statusKey));
            return (
              <div key={t.id} onClick={() => cur && onSelectJob(cur)} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', cursor: cur ? 'pointer' : 'default' }}>
                <Avatar tech={t} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-1)' }}>{t.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--fg-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cur ? `${STATUS_LABEL[cur.statusKey]} · ${cur.address || cur.customer}` : (t.crew || 'Crew')}</div>
                </div>
              </div>
            );
          })}
          {!techs.some((t) => isActive(t.status)) && <div className="muted" style={{ padding: 12, fontSize: 12 }}>No techs en route or on site right now.</div>}
        </div>
      </div>
    </div>
  );
}
const MapPin = ({ job }) => {
  const c = jobColor(job);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))' }}>
      <div style={{ padding: '3px 7px', background: 'var(--bg)', color: 'var(--fg-1)', border: '1px solid ' + c, borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{jobLabel(job)}</div>
      <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '6px solid ' + c, marginTop: -1 }} />
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: c, marginTop: -3 }} />
    </div>
  );
};

// ── ROSTER VIEW ──────────────────────────────────────────────────────────────
export function RosterView({ techs, jobs, onSelectJob }) {
  const dayLen = 14; // ~6a–8p workday for a rough utilization %
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, background: 'var(--bg)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {techs.map((t) => {
          const myJobs = jobs.filter((j) => j.techId === t.id).sort((a, b) => startHourOf(a.scheduledISO) - startHourOf(b.scheduledISO));
          const busyH = myJobs.reduce((s, j) => s + durHours(j), 0);
          const util = Math.min(100, Math.round((busyH / dayLen) * 100));
          const current = myJobs.find((j) => isActive(j.statusKey));
          const next = myJobs.find((j) => j.statusKey === 'scheduled');
          const rev = myJobs.reduce((s, j) => s + (Number(j.amount) || 0), 0);
          return (
            <div key={t.id} style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar tech={t} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--fg-3)', marginTop: 2 }}>{t.crew || 'Crew'}</div>
                </div>
                <StatusPill status={t.status} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <Stat label="Jobs" value={myJobs.length} />
                <Stat label="Util" value={util + '%'} />
                <Stat label="Revenue" value={money(rev)} />
              </div>
              {current && <RosterJobRow job={current} label="Current" onClick={() => onSelectJob(current)} />}
              {next && next !== current && <RosterJobRow job={next} label="Next up" onClick={() => onSelectJob(next)} />}
              {!myJobs.length && <div className="muted" style={{ fontSize: 11.5 }}>No jobs scheduled today.</div>}
            </div>
          );
        })}
        {!techs.length && <div className="muted" style={{ fontSize: 12 }}>No techs yet — add them on the Team screen.</div>}
      </div>
    </div>
  );
}
const RosterJobRow = ({ job, label, onClick }) => (
  <div onClick={onClick} style={{ border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 5, padding: '6px 8px 6px 10px', borderLeft: '3px solid ' + jobColor(job), cursor: 'pointer' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 9.5, color: 'var(--fg-3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
      <StatusDot k={job.statusKey} size={5} />
      <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--fg-3)' }}>{fmtTime(job.scheduledISO)}</span>
    </div>
    <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>{job.job_type || job.customer}</div>
    <div style={{ fontSize: 10.5, color: 'var(--fg-2)' }}>{job.customer}{job.address ? ' · ' + job.address : ''}</div>
  </div>
);

// ── WEEK VIEW (CB week = Sun→Sat) ────────────────────────────────────────────
export function WeekView({ jobs, onSelectJob }) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getTime() + i * 86400000);
    const next = new Date(d.getTime() + 86400000);
    const dayJobs = jobs.filter((j) => { const t = j.scheduledISO ? new Date(j.scheduledISO) : null; return t && t >= d && t < next; });
    return {
      key: i, label: `${wd[i]} ${d.getMonth() + 1}/${d.getDate()}`,
      isToday: d.toDateString() === now.toDateString(),
      jobs: dayJobs, count: dayJobs.length,
      emergency: dayJobs.filter(isEmerg).length,
    };
  });
  const maxCount = Math.max(1, ...days.map((d) => d.count));

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, background: 'var(--bg)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {days.map((d) => (
          <div key={d.key} style={{ background: d.isToday ? 'var(--surface-1)' : 'var(--bg)', padding: 12, minHeight: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: d.isToday ? 'var(--accent)' : 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d.label}{d.isToday ? ' · TODAY' : ''}</span>
              <span style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--mono)', color: d.isToday ? 'var(--accent)' : 'var(--fg-1)' }}>{d.count}</span>
            </div>
            <div style={{ height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((d.count / maxCount) * 100)}%`, background: d.isToday ? 'var(--accent)' : 'var(--fg-3)' }} />
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>
              {d.emergency > 0 && <div style={{ color: STATUS_DOT.late, marginBottom: 4 }}>{d.emergency} emergency</div>}
              <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {d.jobs.filter((j) => isEmerg(j) || /urgent|high/i.test(j.priority || '')).slice(0, 5).map((j) => (
                  <div key={j.id} onClick={() => onSelectJob(j)} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <StatusDot k={j.statusKey} size={5} />
                    <span style={{ fontSize: 10, color: 'var(--fg-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.job_type || j.customer}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>Counts are jobs scheduled per day this week (Sun–Sat). Click an urgent/emergency job to open it.</div>
    </div>
  );
}

// ── CAPACITY VIEW (crew × hour heatmap) ──────────────────────────────────────
export function CapacityView({ techs, jobs }) {
  let dayStart = 6, dayEnd = 20;
  jobs.forEach((j) => { const s = startHourOf(j.scheduledISO), e = endHourOf(j); if (s < dayStart) dayStart = Math.floor(s); if (e > dayEnd) dayEnd = Math.ceil(e); });
  const hours = []; for (let h = dayStart; h < dayEnd; h++) hours.push(h);
  const crews = [...new Set(techs.map((t) => t.crew || 'Crew'))];
  const cellW = 48;
  const hourLabel = (h) => { const hh = ((h % 24) + 24) % 24; const ap = hh < 12 ? 'a' : 'p'; const d = hh % 12 === 0 ? 12 : hh % 12; return `${d}${ap}`; };

  const grid = crews.map((crew) => {
    const crewTechs = techs.filter((t) => (t.crew || 'Crew') === crew);
    return hours.map((h) => {
      let busy = 0;
      for (const t of crewTechs) { if (jobs.some((j) => j.techId === t.id && startHourOf(j.scheduledISO) <= h && endHourOf(j) > h)) busy++; }
      return { busy, total: crewTechs.length, ratio: crewTechs.length ? busy / crewTechs.length : 0 };
    });
  });

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, background: 'var(--bg)' }}>
      <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, maxWidth: 'fit-content' }}>
        <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--fg-2)' }}>Capacity utilization by crew × hour (busy techs / crew size)</div>
        <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${hours.length}, ${cellW}px)`, gap: 2 }}>
          <div />
          {hours.map((h) => <div key={h} style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--mono)', textAlign: 'center' }}>{hourLabel(h)}</div>)}
          {crews.map((crew, zi) => (
            <div key={crew} style={{ display: 'contents' }}>
              <div style={{ fontSize: 11, color: 'var(--fg-2)', display: 'flex', alignItems: 'center', gap: 6, paddingRight: 8 }}><StatusDot k="scheduled" size={0} /><span style={{ width: 8, height: 8, borderRadius: 2, background: crewColor(crew), display: 'inline-block' }} />{crew}</div>
              {grid[zi].map((cell, ci) => {
                const a = Math.min(1, cell.ratio);
                const color = cell.ratio > 0.85 ? STATUS_DOT.late : cell.ratio > 0.6 ? STATUS_DOT.hold : ACCENT;
                return (
                  <div key={ci} title={`${crew} ${hourLabel(hours[ci])} — ${cell.busy}/${cell.total}`} style={{ height: 28, borderRadius: 3, background: cell.total === 0 ? 'var(--surface-2)' : `color-mix(in oklab, ${color} ${a * 90}%, var(--surface-2))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: a > 0.5 ? '#fff' : 'var(--fg-2)', fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums' }}>{cell.total > 0 ? `${cell.busy}/${cell.total}` : '—'}</div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, fontSize: 10.5, color: 'var(--fg-2)' }}>
          <span>Low</span>
          <div style={{ width: 200, height: 8, borderRadius: 4, background: `linear-gradient(90deg, var(--surface-2), ${ACCENT}, ${STATUS_DOT.hold}, ${STATUS_DOT.late})` }} />
          <span>Overcapacity</span>
        </div>
        {!crews.length && <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>No crews yet — add techs with a crew on the Team screen.</div>}
      </div>
    </div>
  );
}

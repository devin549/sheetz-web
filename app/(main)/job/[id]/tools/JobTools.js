'use client';

// Job-specific Tools — needed tools/materials for the job type + the NEAREST available ones (who holds
// it, distance/ETA from this job, route, message, request). Radar shows holders around the job site.
import { useMemo, useState, useTransition } from 'react';
import { requestTool } from '../actions';
import { Search, Navigation, MessageSquare, MapPin, Store } from 'lucide-react';

const dial = (p) => String(p || '').replace(/[^0-9+]/g, '');

export default function JobTools({ jobId, jobType, suggestions = [], tools = [], shopItems = [], address }) {
  const [q, setQ] = useState('');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState({});

  const filt = (s) => !q.trim() || String(s).toLowerCase().includes(q.trim().toLowerCase());
  const located = useMemo(() => tools.filter((t) => t.located).sort((a, b) => a.distMi - b.distMi), [tools]);
  const shownTools = tools.filter((t) => filt(t.name));
  const maxD = Math.max(1, ...located.map((t) => t.distMi));

  const onRequest = (t) => { setMsg(null); start(async () => { const r = await requestTool(t.id, jobId, t.name, t.holder); setMsg(r); if (r?.ok) setDone((d) => ({ ...d, [t.id]: true })); }); };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* needed for job type */}
      {suggestions.length > 0 && (
        <div className="card card-amber">
          <div style={{ fontWeight: 800, marginBottom: 6 }}>🧰 Likely needed · {jobType || 'this job'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{suggestions.map((s) => <span key={s} className="pill" style={{ cursor: 'pointer' }} onClick={() => setQ(s)}>{s}</span>)}</div>
        </div>
      )}

      {/* search */}
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-3)' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a tool — cable machine, jetter, camera…" style={{ width: '100%', padding: '11px 12px 11px 32px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontSize: 14 }} />
      </div>

      {/* radar map of nearest holders */}
      {located.length > 0 && (
        <div className="card">
          <div style={{ fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={15} style={{ color: 'var(--amber)' }} /> Nearest tools · around this job</div>
          <svg viewBox="0 0 200 200" style={{ width: '100%', maxWidth: 280, display: 'block', margin: '0 auto' }}>
            {[30, 60, 90].map((r) => <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="var(--border)" strokeWidth="1" />)}
            <circle cx="100" cy="100" r="6" fill="var(--amber)" /><text x="100" y="118" textAnchor="middle" fontSize="9" fill="var(--fg-3)">job</text>
            {located.slice(0, 8).map((t) => {
              const r = Math.min(90, (t.distMi / maxD) * 85 + 12);
              const a = (t.bearingDeg || 0) * Math.PI / 180;
              const x = 100 + r * Math.sin(a), y = 100 - r * Math.cos(a);
              return <g key={t.id}><circle cx={x} cy={y} r="5" fill="#4caf50" /><text x={x} y={y - 7} textAnchor="middle" fontSize="7" fill="var(--fg-2)">{t.distMi.toFixed(1)}mi</text></g>;
            })}
          </svg>
        </div>
      )}

      {/* tool list */}
      <div style={{ display: 'grid', gap: 8 }}>
        {!shownTools.length && <div className="card"><span className="muted">No tools match. Try a different term, or check the shop below.</span></div>}
        {shownTools.map((t) => (
          <div key={t.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontWeight: 700 }}>{t.name}{t.serial ? <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> · {t.serial}</span> : null}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {t.holder ? <>👷 {t.holder}</> : <>🏷 {t.status || 'unassigned'}</>}
                {t.located ? ` · ${t.distMi.toFixed(1)} mi · ~${t.etaMin} min` : t.holder ? ' · location unknown' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {t.routeUrl && <a href={t.routeUrl} target="_blank" rel="noreferrer" className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--amber)' }}><Navigation size={12} /> Route</a>}
              {t.holderPhone && <a href={`sms:${dial(t.holderPhone)}?body=${encodeURIComponent(`Hey ${t.holder}, can I grab the ${t.name} for my job?`)}`} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MessageSquare size={12} /> Message</a>}
              <button onClick={() => onRequest(t)} disabled={pending || done[t.id]} className="pill" style={{ cursor: 'pointer', color: done[t.id] ? 'var(--green)' : 'var(--amber)', border: '1px solid var(--amber-dim)' }}>{done[t.id] ? '✓ Requested' : 'Reserve / request'}</button>
            </div>
          </div>
        ))}
      </div>

      {/* shop stock */}
      {shopItems.length > 0 && (
        <div className="card">
          <div style={{ fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><Store size={15} style={{ color: 'var(--amber)' }} /> At the shop</div>
          {shopItems.filter((s) => filt(s.item)).slice(0, 8).map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: 13 }}>{s.item}{s.bin ? <span className="muted" style={{ fontSize: 11 }}> · bin {s.bin}</span> : null}</span>
              <span className="pill" style={{ fontSize: 11, color: s.qty > 0 ? 'var(--green)' : 'var(--red)' }}>{s.qty} on hand</span>
            </div>
          ))}
        </div>
      )}
      {msg && <div style={{ fontSize: 12.5, color: msg.ok ? 'var(--green)' : 'var(--red)', textAlign: 'center' }}>{msg.msg}</div>}
    </div>
  );
}

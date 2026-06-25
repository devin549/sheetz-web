'use client';

// Supervisor QA / Closeouts command center — separate from dispatch. Dispatch moves the day;
// the supervisor verifies the work. Date picker + search + closeout/QA filters over the day's jobs.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import DateNav from '../../board/DateNav';
import { STATUS_DOT, fmtTime } from '../../board/boardTokens';
import { Search, X, Camera, CircleCheck, CircleX, Clock, ClipboardCheck } from 'lucide-react';

const QA_LABEL = { pass: 'Passed', fail: 'Failed', partial: 'In review', pending: 'Not reviewed' };
const QA_COLOR = { pass: 'var(--green)', fail: 'var(--red)', partial: 'var(--amber)', pending: 'var(--fg-3)' };

const FILTERS = [
  { k: 'all', label: 'All', test: () => true },
  { k: 'blocked', label: 'Blocked', test: (co) => co.available !== false && !co.readyToClose },
  { k: 'missing', label: 'Missing media', test: (co) => co.available !== false && ((co.photoCount || 0) < (co.minPhotos || 3) || (co.missingKinds || []).length > 0 || (co.requireVideo && !co.haveVideo)) },
  { k: 'pending', label: 'Not reviewed', test: (co) => co.qaState === 'pending' || co.qaState === 'partial' },
  { k: 'fail', label: 'Failed QA', test: (co) => co.qaState === 'fail' },
  { k: 'pass', label: 'Passed QA', test: (co) => co.qaState === 'pass' },
  { k: 'ready', label: 'Ready to close', test: (co) => co.available !== false && co.readyToClose },
];

export default function SupervisorList({ jobs, dateStr, today }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const counts = useMemo(() => {
    const c = {};
    FILTERS.forEach((f) => { c[f.k] = jobs.filter((j) => f.test(j.co || {})).length; });
    return c;
  }, [jobs]);

  const matchQuery = (j) => {
    if (!query) return true;
    const hay = [j.customer, j.address, j.phone, j.job_number, j.tech, j.statusKey, j.job_type].join(' ').toLowerCase();
    return query.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
  };
  const active = FILTERS.find((f) => f.k === filter) || FILTERS[0];
  const shown = jobs.filter((j) => active.test(j.co || {}) && matchQuery(j));

  return (
    <div className="wrap" style={{ maxWidth: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="h1" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardCheck size={22} style={{ color: 'var(--amber)' }} /> QA / Closeouts</div>
        <DateNav date={dateStr} today={today} />
        <Link href="/corrections" className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid var(--amber-dim)', color: 'var(--amber)', fontWeight: 700 }}>🚧 QA Holds</Link>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>Supervisor verifies the work · {jobs.length} jobs</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 8px' }}>
        <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: 440 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-3)' }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customer, address, phone, job #, tech, status…"
            style={{ width: '100%', padding: '9px 30px 9px 32px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontSize: 13 }} />
          {query && <button onClick={() => setQuery('')} aria-label="Clear" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', display: 'flex' }}><X size={15} /></button>}
        </div>
        {(query || filter !== 'all') && <span className="muted" style={{ fontSize: 11 }}>{shown.length} of {jobs.length}</span>}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {FILTERS.map((f) => {
          const on = filter === f.k;
          return (
            <button key={f.k} onClick={() => setFilter((c) => (c === f.k ? 'all' : f.k))} className="pill"
              style={{ cursor: 'pointer', fontSize: 11, border: on ? '1px solid var(--amber)' : '1px solid transparent', background: on ? 'color-mix(in oklab, var(--amber) 16%, var(--surface-2))' : 'var(--surface-2)', color: on ? 'var(--fg-1)' : 'var(--fg-2)', fontWeight: on ? 800 : 600 }}>
              {f.label} <strong>{counts[f.k]}</strong>
            </button>
          );
        })}
      </div>

      {!shown.length && <div className="card"><span className="muted">No jobs match. (Callbacks + warranty filters arrive with those data fields.)</span></div>}

      <div style={{ display: 'grid', gap: 8 }}>
        {shown.map((j) => {
          const co = j.co || {};
          const qa = co.qaState || 'pending';
          const photosOk = (co.photoCount || 0) >= (co.minPhotos || 3);
          const isDone = /done|complete|closed/.test(String(j.status || '').toLowerCase());
          return (
            <Link key={j.id} href={`/job/${j.id}`} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: 'inherit', borderLeft: `3px solid ${co.available !== false && !co.readyToClose ? 'var(--amber)' : 'var(--green)'}` }}>
              <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.prev && <span className="pill" style={{ fontSize: 9, fontWeight: 800, color: 'var(--amber)', marginRight: 6 }}>YESTERDAY</span>}{j.customer}{j.job_number ? <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> · #{j.job_number}</span> : null}</div>
                <div className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.job_type || 'Job'}{j.address ? ` · ${j.address}` : ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--fg-2)', flex: '0 0 auto', minWidth: 90 }}>
                <Clock size={12} />{j.scheduledISO ? fmtTime(j.scheduledISO) : '—'}
              </div>
              <div className="muted" style={{ fontSize: 12, flex: '0 0 auto', minWidth: 90, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.tech}</div>
              <span className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: photosOk ? 'var(--green)' : 'var(--fg-2)' }}><Camera size={12} />{co.photoCount || 0}/{co.minPhotos || 3}</span>
              <span className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 800, color: QA_COLOR[qa] }}>
                {qa === 'pass' ? <CircleCheck size={12} /> : qa === 'fail' ? <CircleX size={12} /> : null}{QA_LABEL[qa]}
              </span>
              <span className="pill" style={{ fontWeight: 800, background: isDone ? 'var(--surface-3)' : co.readyToClose ? 'rgba(70,193,120,.16)' : 'rgba(255,179,0,.14)', color: isDone ? 'var(--fg-2)' : co.readyToClose ? 'var(--green)' : 'var(--amber)' }}>
                {isDone ? 'Closed' : co.readyToClose ? 'Ready' : 'Blocked'}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

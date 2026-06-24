'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { STATUS_DOT, money, fmtTime } from '../board/boardTokens';
import { Search, X } from 'lucide-react';

const STATUS_LABEL = { scheduled: 'Scheduled', enroute: 'En route', onsite: 'On site', hold: 'Hold', done: 'Complete', late: 'Late' };
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' }); } catch { return ''; } };

export default function JobRecordsList({ jobs }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    if (!q) return jobs;
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return jobs.filter((j) => {
      const hay = [j.customer, j.address, j.job_number, j.tech, j.job_type, j.statusKey].join(' ').toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [jobs, q]);

  return (
    <>
      <div style={{ position: 'relative', maxWidth: 440, margin: '0 0 12px' }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-3)' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs…"
          style={{ width: '100%', padding: '9px 30px 9px 32px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontSize: 13 }} />
        {q && <button onClick={() => setQ('')} aria-label="Clear" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', display: 'flex' }}><X size={15} /></button>}
      </div>
      {q && <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>{shown.length} of {jobs.length}</div>}

      <div style={{ display: 'grid', gap: 6 }}>
        {shown.map((j) => (
          <Link key={j.id} href={`/job/${j.id}`} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit', padding: '10px 12px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_DOT[j.statusKey] || 'var(--fg-3)', flexShrink: 0 }} />
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.customer}{j.job_number ? <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}> · #{j.job_number}</span> : null}</div>
              <div className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.job_type || 'Job'}{j.address ? ` · ${j.address}` : ''}</div>
            </div>
            <div className="muted" style={{ fontSize: 12, flex: '0 0 auto', minWidth: 80, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.tech}</div>
            <div className="muted" style={{ fontSize: 11.5, flex: '0 0 auto', minWidth: 92, fontFamily: 'var(--mono)' }}>{j.scheduledISO ? `${fmtDate(j.scheduledISO)} ${fmtTime(j.scheduledISO)}` : '—'}</div>
            <span className="pill" style={{ fontSize: 10.5, flex: '0 0 auto' }}>{STATUS_LABEL[j.statusKey] || j.statusKey}</span>
            {j.amount > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', flex: '0 0 auto', fontFamily: 'var(--mono)', minWidth: 50, textAlign: 'right' }}>{money(j.amount)}</span>}
          </Link>
        ))}
        {!shown.length && <div className="card"><span className="muted">No jobs match.</span></div>}
      </div>
    </>
  );
}

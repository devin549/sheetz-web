'use client';

// 🔍 "Find a job, invoice, or receipt by number…" — the HTML My Day search box (#cbJobSearch).
// Debounced, server-scoped to the tech; tap a result → straight into that job. Mirrors cbJobSearchOpen.
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { searchMyJobs } from './actions';

const fmtWhen = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return ''; } };
const badge = (s) => { s = String(s || '').toLowerCase(); if (/done|complete|closed/.test(s)) return '✓ done'; if (/on_?site/.test(s)) return '🏠 on-site'; if (/enroute|rolling/.test(s)) return '🚗 en route'; if (/cancel/.test(s)) return 'cancelled'; return 'scheduled'; };

export default function JobSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const wrap = useRef(null);

  useEffect(() => {
    const v = q.trim();
    if (v.length < 2) { setRows([]); setOpen(false); return; }
    const my = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      const r = await searchMyJobs(v).catch(() => ({ results: [] }));
      if (my !== seq.current) return; // a newer keystroke won
      setRows(r.results || []); setOpen(true); setBusy(false);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    const onDoc = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const go = (id) => { setOpen(false); setQ(''); router.push(`/job/${id}`); };
  const onKey = (e) => { if (e.key === 'Enter' && rows[0]) go(rows[0].id); if (e.key === 'Escape') setOpen(false); };

  return (
    <div ref={wrap} style={{ position: 'relative', marginBottom: 12 }}>
      <input
        value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => rows.length && setOpen(true)} onKeyDown={onKey}
        type="search" inputMode="search" autoComplete="off"
        placeholder="🔍 Find a job, invoice, or receipt by number…  e.g. 104812"
        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-1)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: 'var(--fg-1)' }} />
      {open && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 50, zIndex: 30, background: 'var(--surface-1)', border: '1px solid var(--border-strong)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
          {rows.length === 0 ? (
            <div className="muted" style={{ padding: '12px 14px', fontSize: 13 }}>{busy ? 'Searching…' : 'No match — try a job number or customer name.'}</div>
          ) : rows.map((r) => (
            <button key={r.id} onClick={() => go(r.id)}
              style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--fg-3)', minWidth: 54 }}>{r.jobNumber ? '#' + r.jobNumber : ''}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customer}</span>
                <span className="muted" style={{ fontSize: 11.5 }}>{r.type}{r.when ? ` · ${fmtWhen(r.when)}` : ''}</span>
              </span>
              <span className="pill" style={{ fontSize: 9.5, color: 'var(--fg-2)' }}>{badge(r.status)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

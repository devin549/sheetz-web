'use client';

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' }); } catch { return d || ''; } };
const statusColor = (s) => /paid|closed/.test(s) ? 'var(--green)' : /void|cancel/.test(s) ? 'var(--fg-3)' : 'var(--amber)';

export default function InvoicesList({ rows }) {
  const [q, setQ] = useState('');
  const [openOnly, setOpenOnly] = useState(false);

  const shown = useMemo(() => {
    let r = rows;
    if (openOnly) r = r.filter((x) => x.balance > 0);
    if (q) {
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      r = r.filter((x) => terms.every((t) => [x.number, x.customer, x.status].join(' ').toLowerCase().includes(t)));
    }
    return r;
  }, [rows, q, openOnly]);

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: 420 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-3)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice #, customer, status…"
            style={{ width: '100%', padding: '9px 30px 9px 32px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--fg-1)', fontSize: 13 }} />
          {q && <button onClick={() => setQ('')} aria-label="Clear" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', display: 'flex' }}><X size={15} /></button>}
        </div>
        <button onClick={() => setOpenOnly((v) => !v)} className="pill" style={{ cursor: 'pointer', fontWeight: openOnly ? 800 : 600, border: openOnly ? '1px solid var(--amber)' : '1px solid transparent', background: openOnly ? 'color-mix(in oklab, var(--amber) 16%, var(--surface-2))' : 'var(--surface-2)' }}>Open balance only</button>
        <span className="muted" style={{ fontSize: 11 }}>{shown.length} shown</span>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr>
            {['Invoice', 'Customer', 'Date', 'Status', 'Total', 'Balance'].map((h, i) => (
              <th key={h} style={{ padding: '8px 12px', textAlign: i > 3 ? 'right' : 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--fg-3)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontSize: 12 }}>{r.number || '—'}</td>
                <td style={{ padding: '9px 12px', fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer}</td>
                <td style={{ padding: '9px 12px', color: 'var(--fg-3)', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtDate(r.date)}</td>
                <td style={{ padding: '9px 12px' }}><span className="pill" style={{ fontSize: 10.5, color: statusColor(r.status), textTransform: 'capitalize' }}>{r.status}</span></td>
                <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{money(r.total)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: r.balance > 0 ? 'var(--red)' : 'var(--fg-3)' }}>{r.balance > 0 ? money(r.balance) : '—'}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} style={{ padding: 16 }}><span className="muted">No invoices match.</span></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

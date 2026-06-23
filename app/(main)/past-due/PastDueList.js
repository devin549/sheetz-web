'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markInvoicePaid, markCustomerPaid } from './actions';

function money(n) { return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function ageColor(days) {
  if (days == null) return 'var(--fg-3)';
  if (days > 90) return 'var(--red)';
  if (days > 60) return '#e65100';
  if (days > 30) return '#e0a800';
  return 'var(--fg-3)';
}
const inBucket = (days, b) => {
  if (b === 'all') return true;
  if (days == null) return b === 'cur';
  if (b === 'cur') return days <= 30;
  if (b === 'd60') return days > 30 && days <= 60;
  if (b === 'd90') return days > 60 && days <= 90;
  if (b === 'd90p') return days > 90;
  return true;
};
const BUCKETS = [['all', 'All'], ['cur', '0–30'], ['d60', '31–60'], ['d90', '61–90'], ['d90p', '90+']];
const ctrl = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '8px 11px', fontSize: 13 };

export default function PastDueList({ customers, canMark }) {
  const router = useRouter();
  const [open, setOpen] = useState({});
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState(null);

  const [q, setQ] = useState('');
  const [bucket, setBucket] = useState('all');
  const [sort, setSort] = useState('owed');

  const toggle = (cid) => setOpen((o) => ({ ...o, [cid]: !o[cid] }));
  const run = (id, fn) => { setBusyId(id); setErr(null); start(async () => { const r = await fn(); setBusyId(null); if (r && !r.ok) setErr(r.msg); else router.refresh(); }); };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = customers.filter((c) => inBucket(c.oldestDays, bucket));
    if (needle) list = list.filter((c) => `${c.name} ${c.cbNumber || ''} ${c.phone || ''}`.toLowerCase().includes(needle));
    list = list.slice().sort((a, b) =>
      sort === 'name' ? String(a.name).localeCompare(String(b.name))
        : sort === 'oldest' ? (b.oldestDays || 0) - (a.oldestDays || 0)
          : b.total - a.total);
    return list;
  }, [customers, q, bucket, sort]);

  const shown = filtered.reduce((a, c) => a + c.total, 0);

  return (
    <>
      {/* search + filter + sort — QuickBooks-style controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Search a customer (name, CB#, phone)…" style={{ ...ctrl, flex: 1, minWidth: 220 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {BUCKETS.map(([k, lbl]) => (
            <button key={k} onClick={() => setBucket(k)} className="pill" style={{ cursor: 'pointer', fontSize: 11, background: bucket === k ? 'var(--accent)' : 'var(--surface-2)', color: bucket === k ? '#fff' : 'var(--fg-2)', fontWeight: bucket === k ? 800 : 600 }}>{lbl} days</button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={ctrl}>
          <option value="owed">Sort: Owed (high→low)</option>
          <option value="oldest">Sort: Oldest first</option>
          <option value="name">Sort: Name A–Z</option>
        </select>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        Showing <strong>{filtered.length}</strong> customer{filtered.length === 1 ? '' : 's'} · {money(shown)}{(q || bucket !== 'all') ? ' (filtered)' : ''}
      </div>

      {err && <div className="notice" style={{ color: 'var(--red)' }}>{err}</div>}
      {!filtered.length && <div className="card"><span className="muted">No customers match — clear the search or filter.</span></div>}
      {filtered.map((c) => {
        const isOpen = !!open[c.cid];
        return (
          <div key={c.cid} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* summary row — click to expand */}
            <div onClick={() => toggle(c.cid)} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', padding: '12px 14px', cursor: 'pointer' }}>
              <span style={{ color: 'var(--fg-3)', fontSize: 12, width: 14 }}>{isOpen ? '▾' : '▸'}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>
                  {c.name}
                  {c.cbNumber && <span className="pill" style={{ marginLeft: 8, color: 'var(--accent)' }}>CB-{c.cbNumber}</span>}
                  {c.phone && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>📞 {c.phone}</span>}
                </div>
                <div style={{ fontSize: 11, color: ageColor(c.oldestDays), fontWeight: 700, marginTop: 2 }}>
                  {c.invoices.length} invoice{c.invoices.length > 1 ? 's' : ''}{c.oldestDays != null ? ` · oldest ${c.oldestDays} days late` : ''}
                </div>
              </div>
              <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{money(c.total)}</span>
            </div>

            {/* expanded: invoices + actions */}
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '6px 14px 12px' }}>
                {canMark && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 0' }}>
                    <button onClick={() => run('cust-' + c.cid, () => markCustomerPaid(c.cid))} disabled={pending}
                      style={{ background: 'var(--green)', color: '#fff', border: 0, borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: pending && busyId === 'cust-' + c.cid ? 0.6 : 1 }}>
                      {busyId === 'cust-' + c.cid ? 'Marking…' : `✓ Mark all paid (${money(c.total)})`}
                    </button>
                  </div>
                )}
                {c.invoices.map((i) => (
                  <div key={i.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', alignItems: 'center', fontSize: 13 }}>
                    <span>#{i.invoice_number}{i.city ? <span className="muted" style={{ fontSize: 11 }}> · {i.city}</span> : ''}</span>
                    <span style={{ color: ageColor(i.days), fontSize: 12, whiteSpace: 'nowrap' }}>{i.invoice_date || '—'}{i.days != null ? ` · ${i.days}d` : ''}</span>
                    <span style={{ fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'right', minWidth: 64 }}>{money(i.balance)}</span>
                    {canMark
                      ? <button onClick={() => run(i.id, () => markInvoicePaid(i.id))} disabled={pending}
                          style={{ background: 'transparent', color: 'var(--green)', border: '1px solid var(--green)', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', opacity: pending && busyId === i.id ? 0.5 : 1 }}>
                          {busyId === i.id ? '…' : '✓ Paid'}
                        </button>
                      : <span />}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

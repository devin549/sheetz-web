'use client';

import { useState, useTransition } from 'react';
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

export default function PastDueList({ customers, canMark }) {
  const router = useRouter();
  const [open, setOpen] = useState({});
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState(null);

  const toggle = (cid) => setOpen((o) => ({ ...o, [cid]: !o[cid] }));
  const run = (id, fn) => { setBusyId(id); setErr(null); start(async () => { const r = await fn(); setBusyId(null); if (r && !r.ok) setErr(r.msg); else router.refresh(); }); };

  if (!customers.length) return <div className="card"><span className="muted">Nothing past due. 🎉</span></div>;

  return (
    <>
      {err && <div className="notice" style={{ color: 'var(--red)' }}>{err}</div>}
      {customers.map((c) => {
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

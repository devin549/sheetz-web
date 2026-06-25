'use client';

// Parts & rentals issued to this job (from the shop counter). Issued parts are consumed — cost stays
// on the job. Rentals must come back: any rental still 'out' BLOCKS closeout, and shows a Return button.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markRentalReturned } from './actions';
import { Package, Timer, CircleCheck } from 'lucide-react';

function money(c) { return '$' + (Number(c || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 }); }

export default function JobParts({ jobId, parts, canReturn }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const items = parts?.items || [];
  if (parts?.available === false || !items.length) return null;

  const ret = (id) => { setBusy(id); setMsg(null); start(async () => { const r = await markRentalReturned(id, jobId); setBusy(null); setMsg(r); if (r?.ok) router.refresh(); }); };
  const outRentals = parts.outRentals || [];

  return (
    <div className="card" style={{ marginTop: 10, borderLeft: `3px solid ${outRentals.length ? 'var(--amber)' : 'var(--border)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Package size={18} style={{ color: 'var(--amber)' }} />
        <div style={{ fontWeight: 800 }}>Parts &amp; Rentals</div>
        {outRentals.length > 0 && <span className="pill pill-red" style={{ marginLeft: 'auto' }}>{outRentals.length} rental{outRentals.length > 1 ? 's' : ''} still out</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((it) => {
          const rental = it.kind === 'rental';
          const out = rental && it.status !== 'returned';
          return (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid ' + (out ? 'var(--amber-dim)' : 'var(--border)') }}>
              {rental ? <Timer size={15} style={{ color: out ? 'var(--amber)' : 'var(--green)', flexShrink: 0 }} /> : <Package size={15} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.qty}× {it.item_name}{it.sku ? <span className="muted" style={{ fontWeight: 400 }}> · {it.sku}</span> : null}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {rental ? (out ? `Rental out${it.rental_daily_cents ? ` · ${money(it.rental_daily_cents)}/day` : ''}` : `Returned`) : `Issued · ${money(it.total_cost_cents)}`}
                  {it.issued_to ? ` · ${it.issued_to}` : ''}
                </div>
              </div>
              {rental && (out ? (
                canReturn
                  ? <button onClick={() => ret(it.id)} disabled={pending} className="btn btn-ghost" style={{ flexShrink: 0, fontSize: 12, padding: '6px 10px', opacity: pending ? 0.6 : 1 }}>{busy === it.id ? '…' : 'Mark returned'}</button>
                  : <span className="pill" style={{ color: 'var(--amber)' }}>out</span>
              ) : (
                <CircleCheck size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />
              ))}
            </div>
          );
        })}
      </div>

      {outRentals.length > 0 && <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Rentals must be returned before this job can close.</div>}
      {msg && <div style={{ fontSize: 12, marginTop: 6, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </div>
  );
}

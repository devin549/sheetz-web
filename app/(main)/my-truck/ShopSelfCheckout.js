'use client';

// 🛒 After-hours self-checkout (in the My Truck → Shop sub-tab). Reed not at the counter? The tech scans/
// types what they grabbed → it goes on the JOB# + comes out of stock, and Reed sees every self-pull.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { shopSelfCheckout } from './shopcoActions';

const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 12px', fontSize: 15 };
const lbl = { fontSize: 11, color: 'var(--fg-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5 };

export default function ShopSelfCheckout({ defaultJob = '' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();

  const submit = (form) => { setMsg(null); start(async () => { const r = await shopSelfCheckout(form); setMsg(r); if (r.ok) { router.refresh(); } }); };

  return (
    <div className="card" style={{ borderLeft: '3px solid var(--amber)', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>🛒</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>After-hours self-checkout</div>
          <div className="muted" style={{ fontSize: 11.5 }}>Reed not at the counter? Log what you grab — it hits the job &amp; Reed reviews it.</div>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="btn" style={{ whiteSpace: 'nowrap' }}>{open ? 'Close' : 'Pull material'}</button>
      </div>

      {open && (
        <form action={submit} style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8 }}>
            <div><label style={lbl}>Job #</label><input name="job_id" inputMode="numeric" autoComplete="off" defaultValue={defaultJob} placeholder="e.g. 104812" style={inp} required /></div>
            <div><label style={lbl}>Qty</label><input name="qty" inputMode="numeric" autoComplete="off" defaultValue="1" style={inp} /></div>
          </div>
          <div><label style={lbl}>Part — scan barcode or type name / sku</label><input name="item_name" autoComplete="off" placeholder="Wax ring (Korky)" style={inp} required /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lbl}>SKU (optional)</label><input name="sku" autoComplete="off" placeholder="041499010205" style={inp} /></div>
            <div><label style={lbl}>Unit cost $ (optional)</label><input name="unit_cost" inputMode="decimal" autoComplete="off" placeholder="0.00" style={inp} /></div>
          </div>
          <input name="note" autoComplete="off" placeholder="Note for Reed (optional)" style={inp} />
          <button type="submit" disabled={pending} className="btn" style={{ opacity: pending ? 0.6 : 1 }}>{pending ? 'Logging…' : '🛒 Pull onto job'}</button>
          {msg && <div style={{ fontSize: 12.5, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
        </form>
      )}
    </div>
  );
}

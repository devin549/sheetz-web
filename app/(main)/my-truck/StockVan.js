'use client';

// 🚐 Load-out: scan/add a part onto the van. Bluetooth scanner types the barcode into the field; the shop
// stocks the van at load-out, or a tech adds what they loaded. This is how van inventory fills (receipts
// only track $). Increments if the part's already on the van.
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { scanOntoVan } from './truckActions';

const inp = { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' };
const lbl = { fontSize: 10.5, color: 'var(--fg-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 4 };

export default function StockVan({ defaultTech = '', canTargetOthers = false }) {
  const router = useRouter();
  const formRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();
  const submit = (form) => { setMsg(null); start(async () => { const r = await scanOntoVan(form); setMsg(r); if (r.ok) { formRef.current?.reset(); router.refresh(); } }); };

  return (
    <div className="card" style={{ borderLeft: '3px solid var(--green)', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>📦</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Stock the van · load-out scan</div>
          <div className="muted" style={{ fontSize: 11.5 }}>Scan or type each part you load. Already on the van? It just adds to the count.</div>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="btn" style={{ whiteSpace: 'nowrap' }}>{open ? 'Close' : '＋ Add part'}</button>
      </div>

      {open && (
        <form action={submit} ref={formRef} style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          {canTargetOthers && <div><label style={lbl}>Which van (tech)</label><input name="tech_name" autoComplete="off" defaultValue={defaultTech} placeholder="tech name" style={{ ...inp, width: '100%' }} /></div>}
          <div><label style={lbl}>Scan barcode or type part name</label><input name="name" autoComplete="off" autoFocus placeholder="Wax ring (Korky)" style={{ ...inp, width: '100%' }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px', gap: 8 }}>
            <div><label style={lbl}>SKU / barcode</label><input name="sku" autoComplete="off" placeholder="041499010205" style={{ ...inp, width: '100%' }} /></div>
            <div><label style={lbl}>Qty</label><input name="qty" inputMode="numeric" defaultValue="1" style={{ ...inp, width: '100%' }} /></div>
            <div><label style={lbl}>Bin (opt)</label><input name="bin" autoComplete="off" placeholder="A3" style={{ ...inp, width: '100%' }} /></div>
          </div>
          <button type="submit" disabled={pending} className="btn" style={{ opacity: pending ? 0.6 : 1 }}>{pending ? 'Adding…' : '📦 Add to van'}</button>
          {msg && <div style={{ fontSize: 12.5, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
        </form>
      )}
    </div>
  );
}

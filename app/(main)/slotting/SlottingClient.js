'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveStock, setBin } from './actions';
import { Plus, X, MapPin } from 'lucide-react';

const input = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 10px', fontSize: 14, fontFamily: 'inherit' };
const label = { fontSize: 10.5, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 3 };

export default function SlottingClient({ stock }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState('');
  const [needBin, setNeedBin] = useState(false);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(null);

  function submit(e) {
    e.preventDefault(); const form = e.currentTarget; setMsg(null);
    start(async () => { const r = await saveStock(new FormData(form)); setMsg(r); if (r.ok) { form.reset(); setOpen(false); router.refresh(); } });
  }
  const onBin = (id, bin, cur) => { if ((bin || '') === (cur || '')) return; start(async () => { const r = await setBin(id, bin); if (!r.ok) setMsg(r); router.refresh(); }); };

  const unbinned = stock.filter((s) => !s.bin).length;
  const shown = useMemo(() => stock.filter((s) => (!needBin || !s.bin) && (!q.trim() || `${s.item} ${s.sku || ''} ${s.bin || ''}`.toLowerCase().includes(q.trim().toLowerCase()))), [stock, q, needBin]);

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0 12px' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item / SKU / bin…" style={{ ...input, width: 220 }} />
        <button type="button" onClick={() => setNeedBin((v) => !v)} className="pill" style={{ cursor: 'pointer', fontWeight: needBin ? 800 : 600, background: needBin ? 'var(--amber)' : 'var(--surface-2)', color: needBin ? '#1a1206' : 'var(--fg-2)' }}>Needs a bin {unbinned}</button>
        <button type="button" className="btn" onClick={() => setOpen((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{open ? <X size={15} /> : <Plus size={15} />}{open ? 'Close' : 'Add item'}</button>
        {msg && <span style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
      </div>

      {open && (
        <form onSubmit={submit} className="card card-amber" style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            <div><span style={label}>Item *</span><input name="item" style={input} required autoComplete="off" /></div>
            <div><span style={label}>SKU</span><input name="sku" style={input} autoComplete="off" /></div>
            <div><span style={label}>Qty</span><input name="qty" type="number" step="0.01" defaultValue="0" style={input} /></div>
            <div><span style={label}>Bin</span><input name="bin" placeholder="A-3…" style={input} autoComplete="off" /></div>
            <div><span style={label}>Min</span><input name="min_qty" type="number" step="0.01" style={input} /></div>
          </div>
          <div><button type="submit" className="btn" disabled={pending}>Save item</button></div>
        </form>
      )}

      {!shown.length && <div className="muted" style={{ fontSize: 13 }}>No items{q || needBin ? ' match' : ' yet'}.</div>}
      <div style={{ display: 'grid', gap: 6 }}>
        {shown.map((s) => (
          <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', flexWrap: 'wrap', borderLeft: `3px solid ${s.bin ? 'var(--green)' : 'var(--amber)'}` }}>
            <span style={{ flex: '1 1 160px', fontWeight: 700, fontSize: 13.5 }}>{s.item}{s.sku ? <span className="muted" style={{ fontSize: 11 }}> · {s.sku}</span> : ''}</span>
            <span className="muted" style={{ fontSize: 12 }}>qty {s.qty}{s.min_qty != null && Number(s.qty) <= Number(s.min_qty) ? ' · low' : ''}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={13} style={{ color: s.bin ? 'var(--green)' : 'var(--fg-3)' }} />
              <input defaultValue={s.bin || ''} placeholder="bin" onBlur={(e) => onBin(s.id, e.target.value.trim(), s.bin)} style={{ ...input, width: 90, padding: '6px 8px' }} />
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

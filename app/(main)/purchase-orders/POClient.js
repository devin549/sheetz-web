'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPO, setPOStatus } from './actions';
import { Plus, X, Trash2 } from 'lucide-react';

const input = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 10px', fontSize: 14, fontFamily: 'inherit' };
const money = (c) => '$' + (Math.round(c || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
const dt = (s) => { try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };
const STATUS = { draft: { c: 'var(--fg-3)', next: 'ordered', label: 'Mark ordered' }, ordered: { c: 'var(--amber)', next: 'received', label: 'Mark received' }, received: { c: 'var(--green)', next: null } };

export default function POClient({ pos, vendors }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState(vendors[0]?.id || '');
  const [lines, setLines] = useState([{ item: '', sku: '', qty: 1, unit_cost: '' }]);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null);

  const setLine = (i, k, v) => setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const addLine = () => setLines((p) => [...p, { item: '', sku: '', qty: 1, unit_cost: '' }]);
  const rmLine = (i) => setLines((p) => p.filter((_, j) => j !== i));
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0);

  function submit() {
    const v = vendors.find((x) => x.id === vendorId);
    if (!v) { setMsg({ ok: false, msg: 'Pick a vendor.' }); return; }
    if (!lines.some((l) => l.item.trim())) { setMsg({ ok: false, msg: 'Add a line item.' }); return; }
    const fd = new FormData();
    fd.set('vendor_id', vendorId); fd.set('vendor_name', v.name); fd.set('note', note);
    fd.set('lines', JSON.stringify(lines.filter((l) => l.item.trim())));
    setMsg(null);
    start(async () => { const r = await createPO(fd); setMsg(r); if (r.ok) { setLines([{ item: '', sku: '', qty: 1, unit_cost: '' }]); setNote(''); setOpen(false); router.refresh(); } });
  }
  const advance = (id, status) => start(async () => { const r = await setPOStatus(id, status); setMsg(r); router.refresh(); });

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 12px' }}>
        <button type="button" className="btn" onClick={() => setOpen((o) => !o)} disabled={!vendors.length} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{open ? <X size={15} /> : <Plus size={15} />}{open ? 'Close' : 'New PO'}</button>
        {!vendors.length && <span className="muted" style={{ fontSize: 12 }}>Add a vendor first (Vendors screen).</span>}
        {msg && <span style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
      </div>

      {open && (
        <div className="card card-amber" style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} style={{ ...input, width: 'auto', maxWidth: 280 }}>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <div style={{ display: 'grid', gap: 6 }}>
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.6fr 0.8fr auto', gap: 6, alignItems: 'center' }}>
                <input value={l.item} onChange={(e) => setLine(i, 'item', e.target.value)} placeholder="Item" style={input} />
                <input value={l.sku} onChange={(e) => setLine(i, 'sku', e.target.value)} placeholder="SKU" style={input} />
                <input value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} type="number" min="0" step="0.01" placeholder="qty" style={input} />
                <input value={l.unit_cost} onChange={(e) => setLine(i, 'unit_cost', e.target.value)} type="number" min="0" step="0.01" placeholder="$ ea" style={input} />
                <button type="button" onClick={() => rmLine(i)} disabled={lines.length === 1} title="Remove" style={{ background: 'none', border: 0, color: 'var(--red)', cursor: 'pointer', opacity: lines.length === 1 ? 0.3 : 1 }}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" onClick={addLine} className="pill" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Plus size={13} /> Add line</button>
            <span style={{ fontWeight: 800, fontSize: 15 }}>Total: {money(total * 100)}</span>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={input} />
          <div><button type="button" className="btn" onClick={submit} disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>{pending ? 'Creating…' : 'Create PO'}</button></div>
        </div>
      )}

      {!pos.length && <div className="card"><span className="muted">No purchase orders yet.</span></div>}
      <div style={{ display: 'grid', gap: 6 }}>
        {pos.map((po) => {
          const s = STATUS[po.status] || STATUS.draft;
          return (
            <div key={po.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', flexWrap: 'wrap', borderLeft: `3px solid ${s.c}` }}>
              <span style={{ fontWeight: 800, fontSize: 13.5 }}>{po.po_number}</span>
              <span style={{ flex: '1 1 120px', fontSize: 13 }}>{po.vendor_name}</span>
              <span style={{ fontWeight: 700 }}>{money(po.total_cents)}</span>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: s.c }}>{po.status}</span>
              <span className="muted" style={{ fontSize: 11 }}>{dt(po.created_at)}</span>
              {s.next && <button type="button" className="pill" onClick={() => advance(po.id, s.next)} disabled={pending} style={{ cursor: 'pointer', color: 'var(--amber)' }}>{s.label}</button>}
            </div>
          );
        })}
      </div>
    </>
  );
}

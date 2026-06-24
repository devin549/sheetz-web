'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveVendor, saveVendorPrice } from './actions';
import { Plus, X, Phone, Tag } from 'lucide-react';

const input = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 10px', fontSize: 14, fontFamily: 'inherit' };
const label = { fontSize: 10.5, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 3 };
const money = (c) => '$' + (Math.round(c || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function VendorsClient({ vendors, prices }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [addV, setAddV] = useState(false);
  const [addP, setAddP] = useState(false);
  const [msg, setMsg] = useState(null);

  function submitVendor(e) {
    e.preventDefault(); const form = e.currentTarget; setMsg(null);
    start(async () => { const r = await saveVendor(new FormData(form)); setMsg(r); if (r.ok) { form.reset(); setAddV(false); router.refresh(); } });
  }
  function submitPrice(e) {
    e.preventDefault(); const form = e.currentTarget; const fd = new FormData(form);
    const v = vendors.find((x) => x.id === fd.get('vendor_id')); if (v) fd.set('vendor_name', v.name);
    setMsg(null);
    start(async () => { const r = await saveVendorPrice(fd); setMsg(r); if (r.ok) { form.reset(); setAddP(false); router.refresh(); } });
  }

  return (
    <>
      {msg && <div style={{ fontSize: 13, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)', marginBottom: 10 }}>{msg.msg}</div>}

      {/* Vendors */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <h3 style={{ fontSize: 12, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.05em', margin: 0 }}>Suppliers · {vendors.length}</h3>
        <button type="button" className="btn" onClick={() => setAddV((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px' }}>{addV ? <X size={14} /> : <Plus size={14} />}{addV ? 'Close' : 'Add vendor'}</button>
      </div>
      {addV && (
        <form onSubmit={submitVendor} className="card card-amber" style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <div><span style={label}>Name *</span><input name="name" placeholder="Ferguson, SupplyHouse…" style={input} required autoComplete="off" /></div>
            <div><span style={label}>Account #</span><input name="account_no" style={input} autoComplete="off" /></div>
            <div><span style={label}>Rep</span><input name="rep" style={input} autoComplete="off" /></div>
            <div><span style={label}>Phone</span><input name="phone" style={input} autoComplete="off" /></div>
            <div><span style={label}>Terms</span><input name="terms" placeholder="Net 30…" style={input} autoComplete="off" /></div>
          </div>
          <div><button type="submit" className="btn" disabled={pending}>Save vendor</button></div>
        </form>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginBottom: 18 }}>
        {!vendors.length && <div className="muted" style={{ fontSize: 13 }}>No vendors yet.</div>}
        {vendors.map((v) => (
          <div key={v.id} className="card" style={{ padding: '11px 13px' }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{v.name}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 3, display: 'grid', gap: 2 }}>
              {v.account_no && <span>acct {v.account_no}</span>}
              {v.rep && <span>{v.rep}</span>}
              {v.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {v.phone}</span>}
              {v.terms && <span>{v.terms}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Price book */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <h3 style={{ fontSize: 12, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.05em', margin: 0 }}><Tag size={13} style={{ verticalAlign: -2 }} /> Price book · {prices.length}</h3>
        {vendors.length > 0 && <button type="button" className="btn" onClick={() => setAddP((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px' }}>{addP ? <X size={14} /> : <Plus size={14} />}{addP ? 'Close' : 'Add price'}</button>}
      </div>
      {addP && (
        <form onSubmit={submitPrice} className="card" style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <div><span style={label}>Vendor</span><select name="vendor_id" style={input}>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
            <div><span style={label}>Item *</span><input name="item" placeholder="part / material" style={input} required autoComplete="off" /></div>
            <div><span style={label}>SKU</span><input name="sku" style={input} autoComplete="off" /></div>
            <div><span style={label}>Price $</span><input name="price" type="number" min="0" step="0.01" style={input} /></div>
            <div><span style={label}>Unit</span><input name="unit" defaultValue="ea" style={input} autoComplete="off" /></div>
          </div>
          <div><button type="submit" className="btn" disabled={pending}>Save price</button></div>
        </form>
      )}
      <div style={{ display: 'grid', gap: 6 }}>
        {!prices.length && <div className="muted" style={{ fontSize: 13 }}>No prices saved yet — add what you pay per part.</div>}
        {prices.map((p) => (
          <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--amber)' }}>{money(p.price_cents)}{p.unit ? `/${p.unit}` : ''}</span>
            <span style={{ flex: '1 1 150px', fontSize: 13 }}>{p.item}{p.sku ? <span className="muted" style={{ fontSize: 11 }}> · {p.sku}</span> : ''}</span>
            <span className="muted" style={{ fontSize: 12 }}>{p.vendor_name || '—'}</span>
          </div>
        ))}
      </div>
    </>
  );
}

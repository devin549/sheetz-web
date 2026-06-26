'use client';

import { useState, useMemo } from 'react';
import { addPricebookItem, updateItemPrice, announceDrop } from './actions';

const emptyForm = { name: '', customerName: '', categoryId: '', retailPrice: '', materialCost: '', customerDescription: '', customerVisible: true };
const inp = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '9px 11px', fontSize: 14, width: '100%' };

export default function PricebookAdmin({ items, cats, needsMig, newCount }) {
  const [list, setList] = useState(items);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [q, setQ] = useState('');
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const add = async () => {
    setBusy(true); setMsg(null);
    const r = await addPricebookItem(form);
    setMsg({ ok: r.ok, t: r.msg });
    if (r.ok && r.item) { setList((l) => [{ ...r.item, isNew: true, customer_visible: form.customerVisible }, ...l]); setForm(emptyForm); }
    setBusy(false);
  };
  const announce = async () => {
    setBusy(true); setMsg(null);
    const r = await announceDrop(168);
    setMsg({ ok: r.ok, t: r.msg });
    setBusy(false);
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? list.filter((i) => `${i.customer_name || ''} ${i.name}`.toLowerCase().includes(s)) : list;
  }, [list, q]);

  return (
    <div className="wrap" style={{ maxWidth: 860 }}>
      <div className="h1" style={{ marginBottom: 2 }}>🛠 Pricebook Editor</div>
      <div style={{ color: 'var(--mute)', fontSize: 14, marginBottom: 14 }}>
        Add and customize what your techs sell. New items get a 🆕 tag for a week — hit <strong>Announce drop</strong> and
        Flush Gordon hypes them to the team. {newCount > 0 && <span style={{ color: 'var(--amber)' }}>· {newCount} new this week</span>}
      </div>

      {needsMig && <div className="notice" style={{ marginBottom: 14 }}>Run <code>supabase/104_pricebook.sql</code> first, then refresh.</div>}

      {/* Add item */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>➕ Add an item</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
          <input placeholder="Item name (internal) *" value={form.name} onChange={(e) => upd('name', e.target.value)} style={inp} />
          <select value={form.categoryId} onChange={(e) => upd('categoryId', e.target.value)} style={inp}>
            <option value="">(no category)</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <input placeholder="Customer-facing name (what they see)" value={form.customerName} onChange={(e) => upd('customerName', e.target.value)} style={{ ...inp, marginBottom: 10 }} />
        <input placeholder="Customer description (optional)" value={form.customerDescription} onChange={(e) => upd('customerDescription', e.target.value)} style={{ ...inp, marginBottom: 10 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--fg-3)' }}>Retail price ($)
            <input type="number" inputMode="decimal" value={form.retailPrice} onChange={(e) => upd('retailPrice', e.target.value)} placeholder="0" style={{ ...inp, marginTop: 3 }} /></label>
          <label style={{ fontSize: 11, color: 'var(--fg-3)' }}>Material cost ($)
            <input type="number" inputMode="decimal" value={form.materialCost} onChange={(e) => upd('materialCost', e.target.value)} placeholder="0" style={{ ...inp, marginTop: 3 }} /></label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}>
          <input type="checkbox" checked={form.customerVisible} onChange={(e) => upd('customerVisible', e.target.checked)} /> Show on customer-facing estimates
        </label>
        <button className="btn btn-primary" disabled={busy || !form.name.trim()} onClick={add}>{busy ? 'Saving…' : 'Add to pricebook'}</button>
        <button className="btn" disabled={busy} onClick={announce} style={{ marginLeft: 8 }}>🚀 Announce drop (Flush Gordon)</button>
        {msg && <span style={{ marginLeft: 12, color: msg.ok ? '#3fae6a' : '#d9534f', fontSize: 13 }}>{msg.t}</span>}
      </div>

      {/* List + inline price edit */}
      <input placeholder={`Search ${list.length} items…`} value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inp, marginBottom: 10 }} />
      <div style={{ display: 'grid', gap: 7 }}>
        {filtered.slice(0, 200).map((i) => <ItemRow key={i.id} i={i} />)}
        {!filtered.length && !needsMig && <div style={{ color: 'var(--mute)', fontSize: 14 }}>No items match.</div>}
      </div>
    </div>
  );
}

function ItemRow({ i }) {
  const [price, setPrice] = useState(i.retail_price != null ? String(i.retail_price) : '');
  const [saved, setSaved] = useState(i.retail_price);
  const [busy, setBusy] = useState(false);
  const dirty = String(saved) !== price;
  const save = async () => { setBusy(true); const r = await updateItemPrice(i.id, price); if (r.ok) setSaved(Number(price) || 0); setBusy(false); };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{i.customer_name || i.name}{i.isNew && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: '#ff8a3d', border: '1px solid #ff8a3d', borderRadius: 6, padding: '1px 5px' }}>🆕 NEW</span>}{i.customer_visible === false && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--fg-3)' }}>· internal</span>}</div>
      </div>
      <span style={{ color: 'var(--fg-3)', fontSize: 13 }}>$</span>
      <input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} style={{ ...inp, width: 92, padding: '6px 8px' }} />
      <button className="btn" disabled={busy || !dirty} onClick={save} style={{ fontSize: 12, opacity: busy || !dirty ? 0.5 : 1 }}>{busy ? '…' : 'Save'}</button>
    </div>
  );
}

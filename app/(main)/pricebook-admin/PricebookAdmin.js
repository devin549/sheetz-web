'use client';

import { useState, useMemo } from 'react';
import { addPricebookItem, updateItemPrice, announceDrop, runMarginWatch, runMaterialGuardrail, approvePriceChange, rejectPriceChange } from './actions';
import PartsClassify from './PartsClassify';
import CategoryTree from './CategoryTree';
import ItemEditor from './ItemEditor';
import MaterialCostRollup from './MaterialCostRollup';
import ProfitIntel from './ProfitIntel';
import ConversionStats from './ConversionStats';
import LearnedCustomJobs from './LearnedCustomJobs';
import BundleBuilder from './BundleBuilder';

const emptyForm = { name: '', customerName: '', categoryId: '', retailPrice: '', materialCost: '', customerDescription: '', customerVisible: true };
const inp = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '9px 11px', fontSize: 14, width: '100%' };

export default function PricebookAdmin({ items, cats, needsMig, newCount, priceReqs = [], priceGate = {}, bundles = [] }) {
  const canMovePrice = priceGate.canMovePrice !== false; // owner/admin only — page computes the gate
  const canEditPriceFields = priceGate.canEditPriceFields !== false;
  const canEditContent = priceGate.canEditContent !== false;
  const [list, setList] = useState(items);
  const [reqs, setReqs] = useState(priceReqs);
  const [scan, setScan] = useState(false);
  const [scanMsg, setScanMsg] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [q, setQ] = useState('');
  const [editId, setEditId] = useState(null);
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

  const watch = async () => {
    setScan(true); setScanMsg(null);
    const r = await runMarginWatch();
    setScanMsg({ ok: r.ok, t: r.msg });
    setScan(false);
  };
  // Phase 2a #2 — material-over-threshold guardrail. Files into the SAME owner-approve queue as margin
  // watch; freshly-flagged rows show after a refresh (the queue is loaded server-side, like margin watch).
  const guardrail = async () => {
    setScan(true); setScanMsg(null);
    const r = await runMaterialGuardrail();
    setScanMsg({ ok: r.ok, t: r.msg + (r.ok && /Flagged/.test(r.msg) ? ' Refresh to review them below.' : '') });
    setScan(false);
  };
  const decide = async (id, approve) => {
    setReqs((rs) => rs.map((x) => (x.id === id ? { ...x, busy: true } : x)));
    const r = approve ? await approvePriceChange(id) : await rejectPriceChange(id);
    if (r.ok) {
      setReqs((rs) => rs.filter((x) => x.id !== id));
      if (approve) {
        const done = reqs.find((x) => x.id === id);
        if (done) setList((l) => l.map((i) => (i.id === done.item_id ? { ...i, retail_price: done.recommended_price } : i)));
      }
    } else {
      setReqs((rs) => rs.map((x) => (x.id === id ? { ...x, busy: false, err: r.msg } : x)));
    }
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
        {canEditPriceFields ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: 'var(--fg-3)' }}>Retail price ($)
              <input type="number" inputMode="decimal" value={form.retailPrice} onChange={(e) => upd('retailPrice', e.target.value)} placeholder="0" style={{ ...inp, marginTop: 3 }} /></label>
            <label style={{ fontSize: 11, color: 'var(--fg-3)' }}>Material cost ($)
              <input type="number" inputMode="decimal" value={form.materialCost} onChange={(e) => upd('materialCost', e.target.value)} placeholder="0" style={{ ...inp, marginTop: 3 }} /></label>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 10 }}>Pricing is owner-set — add the item, then the owner prices it. You manage names, copy, photos &amp; categories.</div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}>
          <input type="checkbox" checked={form.customerVisible} onChange={(e) => upd('customerVisible', e.target.checked)} /> Show on customer-facing estimates
        </label>
        <button className="btn btn-primary" disabled={busy || !form.name.trim()} onClick={add}>{busy ? 'Saving…' : 'Add to pricebook'}</button>
        <button className="btn" disabled={busy} onClick={announce} style={{ marginLeft: 8 }}>🚀 Announce drop (Flush Gordon)</button>
        {msg && <span style={{ marginLeft: 12, color: msg.ok ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>{msg.t}</span>}
      </div>

      {/* 📉 Margin Watch — AI suggests, you approve. Never auto-changes a price. Hidden from price-locked roles. */}
      {canEditPriceFields && (
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800 }}>📉 Margin Watch {reqs.length > 0 && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 6, padding: '1px 6px' }}>{reqs.length} to review</span>}</div>
            <div style={{ color: 'var(--mute)', fontSize: 12.5, marginTop: 2 }}>The AI flags items priced under target margin — or where material is too big a slice of the ticket. <strong>It never changes a price</strong> — you approve or reject each one.</div>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button className="btn" disabled={scan} onClick={watch}>{scan ? 'Scanning…' : '🔍 Margin scan'}</button>
            <button className="btn" disabled={scan} onClick={guardrail} title="Flag items where material is over the guardrail % of the ticket">{scan ? '…' : '🧱 Material scan'}</button>
          </div>
        </div>
        {scanMsg && <div style={{ marginTop: 8, color: scanMsg.ok ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>{scanMsg.t}</div>}
        {reqs.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {reqs.map((r) => (
              <div key={r.id} style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.itemName}</div>
                    <div style={{ fontSize: 13, marginTop: 3 }}>
                      <span style={{ color: 'var(--fg-3)', textDecoration: 'line-through' }}>${r.old_price}</span>
                      <span style={{ margin: '0 7px', color: 'var(--fg-3)' }}>→</span>
                      <span style={{ fontWeight: 800, color: 'var(--green)' }}>${r.recommended_price}</span>
                      {r.source && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--fg-3)' }}>· {r.source === 'margin-watch' ? 'margin' : r.source === 'material-guardrail' ? 'material %' : r.source}</span>}
                    </div>
                    <div style={{ color: 'var(--mute)', fontSize: 12, marginTop: 3 }}>{r.reason}</div>
                    {r.err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 3 }}>{r.err}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button className="btn btn-primary" disabled={r.busy} onClick={() => decide(r.id, true)} style={{ fontSize: 12 }}>{r.busy ? '…' : '✓ Approve'}</button>
                    <button className="btn" disabled={r.busy} onClick={() => decide(r.id, false)} style={{ fontSize: 12 }}>Reject</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* 💲 Parts → material-cost rollup (Phase 2a #1) + 📊 Profit intelligence (#3). Cost/insight only —
          no live price moves. Both owner/gm/om (same gate as Margin Watch). */}
      {canEditPriceFields && <MaterialCostRollup />}
      {canEditPriceFields && <ProfitIntel />}

      {/* 📈 Conversion analytics (Phase 4) — READ-ONLY "what's converting" feedback loop: funnel, tier mix,
          avg ticket, by-bundle close rates, decline reasons. Owner/gm/om gate (same as the margin tools);
          server action re-checks canEditPriceFields. Never writes a price or status. */}
      {canEditPriceFields && <ConversionStats />}

      {/* 🧠 Learned custom jobs (Phase 2b-ii) — review the ad-hoc lines techs typed, promote recurring ones
          to a hidden $0 Master Task the owner then prices. Merchandising gate (owner/gm/om/marketing). */}
      {canEditContent && !needsMig && <LearnedCustomJobs />}

      {/* Category tree management (1b) */}
      {!needsMig && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>🗂 Categories</div>
          <div style={{ color: 'var(--mute)', fontSize: 12.5, marginBottom: 10 }}>Organize the book — add main/sub, rename, reorder, move, archive. Safe-delete blocks anything with items or subcategories.</div>
          <CategoryTree />
        </div>
      )}

      {/* 🪜 Good/Better/Best Bundle Builder — author the customer-facing tier ladder per job type. */}
      {!needsMig && <BundleBuilder initialBundles={bundles} />}

      {/* 🧩 Parts & live vendor cost (learn → classify → SerpAPI price) */}
      {!needsMig && <PartsClassify items={list} />}

      {/* List + inline price edit + full editor */}
      <input placeholder={`Search ${list.length} items…`} value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inp, marginBottom: 10 }} />
      <div style={{ display: 'grid', gap: 7 }}>
        {filtered.slice(0, 200).map((i) => <ItemRow key={i.id} i={i} canMovePrice={canMovePrice} onEdit={() => setEditId(i.id)} />)}
        {!filtered.length && !needsMig && <div style={{ color: 'var(--mute)', fontSize: 14 }}>No items match.</div>}
      </div>

      {editId && <ItemEditor itemId={editId} cats={cats} onClose={() => setEditId(null)} onSaved={() => { /* row refresh handled by revalidatePath on next load */ }} />}
    </div>
  );
}

function ItemRow({ i, onEdit, canMovePrice = true }) {
  const [price, setPrice] = useState(i.retail_price != null ? String(i.retail_price) : '');
  const [saved, setSaved] = useState(i.retail_price);
  const [busy, setBusy] = useState(false);
  const dirty = String(saved) !== price;
  const save = async () => { setBusy(true); const r = await updateItemPrice(i.id, price); if (r.ok) setSaved(Number(price) || 0); setBusy(false); };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{i.customer_name || i.name}{i.isNew && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 6, padding: '1px 5px' }}>🆕 NEW</span>}{i.customer_visible === false && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--fg-3)' }}>· internal</span>}</div>
      </div>
      {/* Inline live-price edit is owner/admin only. Price-locked roles use the editor's Pricing tab (queues for approval). */}
      {canMovePrice ? (
        <>
          <span style={{ color: 'var(--fg-3)', fontSize: 13 }}>$</span>
          <input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} style={{ ...inp, width: 92, padding: '6px 8px' }} />
          <button className="btn" disabled={busy || !dirty} onClick={save} style={{ fontSize: 12, opacity: busy || !dirty ? 0.5 : 1 }}>{busy ? '…' : 'Save'}</button>
        </>
      ) : (
        i.retail_price != null && <span style={{ color: 'var(--fg-3)', fontSize: 12 }}>${i.retail_price}</span>
      )}
      <button className="btn" onClick={onEdit} style={{ fontSize: 12 }}>✎ Edit</button>
    </div>
  );
}

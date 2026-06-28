'use client';

// 💲 Parts → material-cost rollup (Phase 2a #1). The owner/office runs a scan; for each service that has
// priced learned parts we show the SUGGESTED material cost (Σ vendor_price × qty). Confirming writes
// estimated_material_cost (COST, not the sell price) — gated server-side to owner/gm/om. Nothing here
// moves a live price. Gated in the parent to canEditPriceFields.
import { useState } from 'react';
import { suggestMaterialCosts, confirmMaterialCost } from './actions';

export default function MaterialCostRollup() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const scan = async () => {
    setBusy(true); setMsg(null);
    const r = await suggestMaterialCosts();
    setMsg({ ok: r.ok, t: r.msg });
    setRows(r.ok ? (r.rows || []) : null);
    setBusy(false);
  };
  const confirm = async (itemId) => {
    setRows((rs) => rs.map((x) => (x.itemId === itemId ? { ...x, busy: true } : x)));
    const r = await confirmMaterialCost(itemId);
    if (r.ok) {
      setRows((rs) => rs.map((x) => (x.itemId === itemId ? { ...x, currentCost: r.cost, changed: false, done: true, busy: false } : x)));
    } else {
      setRows((rs) => rs.map((x) => (x.itemId === itemId ? { ...x, busy: false, err: r.msg } : x)));
    }
  };

  const toReview = (rows || []).filter((r) => r.changed && !r.done);

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800 }}>💲 Material-cost rollup
            {toReview.length > 0 && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: 'var(--amber)', border: '1px solid var(--amber)', borderRadius: 6, padding: '1px 6px' }}>{toReview.length} to confirm</span>}</div>
          <div style={{ color: 'var(--mute)', fontSize: 12.5, marginTop: 2 }}>Adds up each service’s priced parts into a suggested <strong>material cost</strong>. You confirm to set it — this is cost, not the customer price.</div>
        </div>
        <button className="btn" disabled={busy} onClick={scan}>{busy ? 'Scanning…' : '🔍 Suggest costs'}</button>
      </div>
      {msg && <div style={{ marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>{msg.t}</div>}
      {toReview.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {toReview.map((r) => (
            <div key={r.itemId} style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.name}</div>
                  <div style={{ fontSize: 13, marginTop: 3 }}>
                    {r.currentCost > 0
                      ? <><span style={{ color: 'var(--fg-3)', textDecoration: 'line-through' }}>${r.currentCost}</span><span style={{ margin: '0 7px', color: 'var(--fg-3)' }}>→</span></>
                      : <span style={{ color: 'var(--fg-3)', marginRight: 7 }}>no cost yet →</span>}
                    <span style={{ fontWeight: 800, color: 'var(--amber)' }}>${r.suggestedCost}</span>
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--fg-3)' }}>from {r.partCount} part{r.partCount === 1 ? '' : 's'}</span>
                  </div>
                  {r.err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 3 }}>{r.err}</div>}
                </div>
                <button className="btn btn-primary" disabled={r.busy} onClick={() => confirm(r.itemId)} style={{ fontSize: 12 }}>{r.busy ? '…' : '✓ Confirm cost'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {rows && !toReview.length && msg?.ok && <div style={{ color: 'var(--mute)', fontSize: 12.5, marginTop: 8 }}>Nothing to confirm right now.</div>}
    </div>
  );
}

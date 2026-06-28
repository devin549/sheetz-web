'use client';

// Review likely-duplicate customers → pick the keeper → merge the rest onto it. The keeper defaults to
// the record with an ST id + the most history; you can override. Merging moves all invoices/jobs/history
// onto the keeper and removes the duplicate (audited).
import { useState, useTransition } from 'react';
import { findDuplicateCustomers, mergeDuplicate } from './actions';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function ReconcileClient({ initial }) {
  const [groups, setGroups] = useState(initial.groups || []);
  const [total, setTotal] = useState(initial.totalCustomers || 0);
  const [keepers, setKeepers] = useState({}); // groupIdx -> chosen keeper id (defaults to suggested)
  const [done, setDone] = useState({});        // groupIdx -> merged summary
  const [toast, setToast] = useState(null);
  const [busy, start] = useTransition();
  const [scanning, startScan] = useTransition();

  const keeperFor = (gi, g) => keepers[gi] || g.keeperId;

  const rescan = () => { setToast(null); startScan(async () => { const r = await findDuplicateCustomers(); if (r.ok) { setGroups(r.groups); setTotal(r.totalCustomers); setDone({}); setKeepers({}); setToast({ ok: true, msg: `Found ${r.groups.length} duplicate group(s).` }); } else setToast({ ok: false, msg: r.msg }); }); };

  const mergeGroup = (gi, g) => {
    const keepId = keeperFor(gi, g);
    const dupes = g.members.filter((m) => m.id !== keepId);
    if (!dupes.length) return;
    const keepName = (g.members.find((m) => m.id === keepId) || {}).name || 'the keeper';
    if (!window.confirm(`Merge ${dupes.length} record(s) into "${keepName}"? Their invoices, jobs, and history move onto it and the duplicate(s) are removed.`)) return;
    setToast(null);
    start(async () => {
      let ok = 0, msg = '';
      for (const d of dupes) { const r = await mergeDuplicate(keepId, d.id); if (r.ok) ok++; else msg = r.msg || 'merge failed'; }
      setDone((s) => ({ ...s, [gi]: { keepName, merged: ok } }));
      setToast(ok ? { ok: true, msg: `Merged ${ok} into ${keepName}.` } : { ok: false, msg: msg || 'Merge failed.' });
    });
  };

  const pending = groups.filter((_, gi) => !done[gi]);

  return (
    <>
      <div className="card card-amber" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 13 }}>
          <strong>{pending.length}</strong> duplicate group(s) to review · scanned <strong>{total.toLocaleString()}</strong> customers
        </div>
        <button onClick={rescan} disabled={scanning} className="pill" style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, border: '1px solid var(--border-strong)', padding: '8px 14px' }}>{scanning ? 'Scanning…' : '🔄 Re-scan'}</button>
      </div>
      {toast && <div style={{ fontSize: 12.5, fontWeight: 700, color: toast.ok ? 'var(--green)' : 'var(--red)', margin: '-2px 0 10px' }}>{toast.msg}</div>}

      {!pending.length && <div className="card"><span className="muted">No duplicates to review. 🎉 Re-scan after your next import or soft-test batch.</span></div>}

      {groups.map((g, gi) => {
        if (done[gi]) return (
          <div key={gi} className="card" style={{ marginBottom: 8, opacity: 0.7, borderColor: 'var(--green)' }}>
            <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 13 }}>✓ Merged {done[gi].merged} into {done[gi].keepName}.</span>
          </div>
        );
        const keepId = keeperFor(gi, g);
        return (
          <div key={gi} className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>{g.reason} · {g.members.length} records</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {g.members.map((m) => {
                const isKeep = m.id === keepId;
                return (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${isKeep ? 'var(--green)' : 'var(--border)'}`, background: isKeep ? 'color-mix(in oklab, var(--green) 8%, var(--surface-2))' : 'var(--surface-2)' }}>
                    <input type="radio" name={`keep-${gi}`} checked={isKeep} onChange={() => setKeepers((s) => ({ ...s, [gi]: m.id }))} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.name || '(no name)'} {isKeep && <span className="pill" style={{ fontSize: 9.5, color: 'var(--green)', border: '1px solid var(--green)', marginLeft: 4 }}>KEEP</span>}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {m.phone ? `${m.phone} · ` : ''}{m.st_customer_id ? `ST #${m.st_customer_id} · ` : 'native (no ST id) · '}
                        {m.invoices} inv · {m.jobs} jobs{m.lifetime_revenue ? ` · ${money(m.lifetime_revenue)} lifetime` : ''}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div style={{ marginTop: 9 }}>
              <button onClick={() => mergeGroup(gi, g)} disabled={busy} className="btn" style={{ fontSize: 12.5, padding: '7px 13px' }}>{busy ? 'Merging…' : `Merge ${g.members.length - 1} into keeper`}</button>
            </div>
          </div>
        );
      })}
    </>
  );
}

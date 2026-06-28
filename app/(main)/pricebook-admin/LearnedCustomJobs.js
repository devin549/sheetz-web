'use client';

// 🧠 Learned custom jobs (Phase 2b-ii) — the admin review queue for the Always-Learning Loop.
// Techs type ad-hoc "custom" lines on jobs not in the catalog (job pricebook → "Custom item"). Those are
// recorded; here they're grouped by normalized name with a frequency count ("rebuild toilet · 5×"). The
// owner/office PROMOTES a recurring one to a real Master Task — a hidden $0 shell the OWNER then prices —
// or DISMISSES it. Nothing here writes a catalog price (the recorded custom price was a per-job quote).
import { useState } from 'react';
import { loadCustomEntries, promoteCustomEntry, dismissCustomEntry } from './actions';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function LearnedCustomJobs() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [rowMsg, setRowMsg] = useState({});       // key → { ok, t }
  const [done, setDone] = useState({});           // key → 'promoted' | 'dismissed'

  const run = async () => {
    setBusy(true); setMsg(null); setRowMsg({}); setDone({});
    const r = await loadCustomEntries({ days: 90, minCount: 1 });
    setMsg({ ok: r.ok, t: r.msg });
    setData(r.ok ? r : null);
    setBusy(false);
  };

  const promote = async (g) => {
    setRowMsg((m) => ({ ...m, [g.key]: { busy: true } }));
    const r = await promoteCustomEntry({ entryIds: g.ids, name: g.label, description: g.cleanedDescription || '', category: g.suggestedCategory || '' });
    setRowMsg((m) => ({ ...m, [g.key]: { ok: r.ok, t: r.msg } }));
    if (r.ok) setDone((d) => ({ ...d, [g.key]: 'promoted' }));
  };
  const dismiss = async (g) => {
    setRowMsg((m) => ({ ...m, [g.key]: { busy: true } }));
    const r = await dismissCustomEntry({ entryIds: g.ids });
    setRowMsg((m) => ({ ...m, [g.key]: { ok: r.ok, t: r.msg } }));
    if (r.ok) setDone((d) => ({ ...d, [g.key]: 'dismissed' }));
  };

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800 }}>🧠 Learned custom jobs
            {data && data.recurring > 0 && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: 'var(--amber)', border: '1px solid var(--amber)', borderRadius: 6, padding: '1px 6px' }}>{data.recurring} recurring</span>}</div>
          <div style={{ color: 'var(--mute)', fontSize: 12.5, marginTop: 2 }}>Odd jobs your techs typed as custom lines, grouped by how often they recur. <strong>Promote</strong> a repeat one to a Master Task — it becomes a hidden $0 shell you then price. Nothing here moves a price.</div>
        </div>
        <button className="btn" disabled={busy} onClick={run}>{busy ? 'Loading…' : '🔍 Review custom jobs'}</button>
      </div>
      {msg && <div style={{ marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>{msg.t}</div>}

      {data && data.groups.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {data.groups.map((g) => {
            const rm = rowMsg[g.key] || {};
            const state = done[g.key];
            return (
              <div key={g.key} style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid ' + (g.count >= 2 ? 'var(--amber-dim, var(--border))' : 'var(--border)'), opacity: state ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                      {g.label}
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: g.count >= 2 ? 'var(--amber)' : 'var(--fg-3)' }}>{g.count}×</span>
                      {g.suggestedCategory && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--fg-3)' }}>· {g.suggestedCategory}</span>}
                    </div>
                    {g.cleanedDescription && <div style={{ color: 'var(--mute)', fontSize: 12, marginTop: 3 }}>{g.cleanedDescription}</div>}
                    {(g.minPrice != null) && (
                      <div style={{ color: 'var(--fg-3)', fontSize: 11, marginTop: 3 }}>
                        techs quoted {g.minPrice === g.maxPrice ? money(g.minPrice) : `${money(g.minPrice)}–${money(g.maxPrice)}`} on the job · for reference only, not a catalog price
                      </div>
                    )}
                  </div>
                  {!state && (
                    <div style={{ display: 'flex', gap: 7 }}>
                      <button className="btn btn-primary" disabled={rm.busy} onClick={() => promote(g)} style={{ fontSize: 12 }} title="Create a hidden $0 Master Task shell for the owner to price">{rm.busy ? '…' : '⬆ Promote'}</button>
                      <button className="btn" disabled={rm.busy} onClick={() => dismiss(g)} style={{ fontSize: 12 }}>Dismiss</button>
                    </div>
                  )}
                  {state === 'promoted' && <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>✓ Promoted — price it in the editor below</span>}
                  {state === 'dismissed' && <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Dismissed</span>}
                </div>
                {rm.t && !state && <div style={{ marginTop: 6, fontSize: 12, color: rm.ok ? 'var(--green)' : 'var(--red)' }}>{rm.t}</div>}
              </div>
            );
          })}
          <div style={{ color: 'var(--fg-3)', fontSize: 11, marginTop: 2 }}>
            Last {data.windowDays} days · {data.total} custom job{data.total === 1 ? '' : 's'} logged. Promote creates a $0 hidden shell — you set the price.
          </div>
        </div>
      )}
    </div>
  );
}

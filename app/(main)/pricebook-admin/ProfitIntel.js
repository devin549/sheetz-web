'use client';

// 📊 Profit intelligence (Phase 2a #3) — READ-ONLY. From job_pricebook_usage joined to the job timeline
// we show, per item: avg actual time-to-complete, effective $/hr, avg margin %, # times sold — and flag
// the money-losers (low $/hr or thin/negative margin). When a job has no clean on-site timeline we fall
// back to the line's estimated_labor_hours and LABEL the row "est." Nothing here changes a price.
import { useState } from 'react';
import { loadProfitIntel } from './actions';

const money = (n) => (n == null ? '—' : '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }));

export default function ProfitIntel() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const run = async () => {
    setBusy(true); setMsg(null);
    const r = await loadProfitIntel({ limit: 40 });
    setMsg({ ok: r.ok, t: r.msg });
    setData(r.ok ? r : null);
    setBusy(false);
  };

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800 }}>📊 Profit intelligence
            {data && data.losers > 0 && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 6, padding: '1px 6px' }}>{data.losers} money-loser{data.losers === 1 ? '' : 's'}</span>}</div>
          <div style={{ color: 'var(--mute)', fontSize: 12.5, marginTop: 2 }}>What each item really earns per hour on the job. Read-only — no prices change here.</div>
        </div>
        <button className="btn" disabled={busy} onClick={run}>{busy ? 'Crunching…' : '📈 Run profit scan'}</button>
      </div>
      {msg && <div style={{ marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>{msg.t}</div>}

      {data && data.rows.length > 0 && (
        <>
          {!data.anyActual && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--amber)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px' }}>
              ⏱ No on-site timeline yet — hours shown are the pricebook <strong>estimate</strong> (“est.”), not measured time.
            </div>
          )}
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--fg-3)', fontSize: 11 }}>
                  <th style={{ padding: '4px 8px' }}>Item</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Sold</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Avg $</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Avg hrs</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>$/hr</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.itemId} style={{ borderTop: '1px solid var(--border)', background: r.lowProfit ? 'rgba(220,60,60,0.06)' : 'transparent' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>
                      {r.lowProfit && <span title="Low $/hr or thin margin" style={{ marginRight: 5 }}>⚠️</span>}{r.name}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.timesSold}×</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{money(r.avgSold)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: r.usedActual ? 'var(--fg-1)' : 'var(--fg-3)' }}>
                      {r.avgHours}{r.usedActual ? '' : ' est.'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: r.hourly == null ? 'var(--fg-3)' : (r.hourly < data.lowHourly ? 'var(--red)' : 'var(--green)') }}>
                      {r.hourly == null ? '—' : money(r.hourly)}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: r.avgMargin == null ? 'var(--fg-3)' : (r.avgMargin < data.lowMargin ? 'var(--red)' : 'var(--fg-1)') }}>
                      {r.avgMargin == null ? '—' : r.avgMargin + '%'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ color: 'var(--fg-3)', fontSize: 11, marginTop: 8 }}>
            Showing {data.rows.length} of {data.total}. Flagged when $/hr &lt; ${data.lowHourly} or margin &lt; {data.lowMargin}%.
          </div>
        </>
      )}
    </div>
  );
}

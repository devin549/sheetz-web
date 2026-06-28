'use client';

// 📈 Conversion analytics (Phase 4) — READ-ONLY "What's converting" panel. Turns the estimate event log
// into the feedback loop so the owner can tune the ladders: the funnel (sent → viewed → approved + close
// rate), the tier mix of approved estimates (is Better actually landing? — the compromise-effect check),
// the avg approved ticket, per-bundle close-rates, and why people decline. Nothing here writes anything —
// no price, no status, pure analytics. Honest counts only; small samples are labeled. Empty data → an
// honest "no estimates yet" state. Gated owner/gm/om server-side AND hidden in the UI unless allowed.
import { useState } from 'react';
import { loadConversionStats } from './actions';

const money = (n) => (n == null ? '—' : '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }));
const pct = (n) => (n == null ? '—' : n + '%');
const WINDOWS = [30, 90, 180, 365];

// One funnel stage card (Sent / Viewed / Approved) — the headline numbers.
function Stage({ label, value, sub, accent }) {
  return (
    <div style={{ flex: 1, minWidth: 120, padding: '12px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: accent || 'var(--fg-1)', lineHeight: 1.1, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// A tier-mix bar — the compromise-effect read: of approved ladders, who chose Good / Better / Best.
function TierBar({ tier, label, count, percent, hero }) {
  const colors = { good: 'var(--fg-3)', better: 'var(--amber)', best: 'var(--green)' };
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
        <span style={{ fontWeight: hero ? 800 : 600, color: hero ? 'var(--amber)' : 'var(--fg-1)' }}>
          {hero && '⭐ '}{label}
        </span>
        <span style={{ color: 'var(--fg-3)' }}>{pct(percent)} <span style={{ color: 'var(--fg-3)', opacity: 0.7 }}>({count})</span></span>
      </div>
      <div style={{ height: 8, borderRadius: 5, background: 'var(--surface-2)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ width: (percent || 0) + '%', height: '100%', background: colors[tier] || 'var(--amber)', transition: 'width .3s' }} />
      </div>
    </div>
  );
}

export default function ConversionStats() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const run = async (d = days) => {
    setBusy(true); setMsg(null);
    const r = await loadConversionStats({ days: d });
    if (!r.ok) { setMsg({ ok: false, t: r.msg }); setData(null); setBusy(false); return; }
    setData(r);
    setBusy(false);
  };

  const s = data?.stats;
  const empty = s?.isEmpty;
  const f = s?.funnel;
  const tm = s?.tierMix;
  // Hero = the tier with the highest share (the compromise-effect winner) — ideally Better.
  const heroTier = tm && tm.total > 0
    ? ['good', 'better', 'best'].reduce((best, k) => ((tm.pct[k] ?? -1) > (tm.pct[best] ?? -1) ? k : best), 'better')
    : null;

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800 }}>📈 What&apos;s converting</div>
          <div style={{ color: 'var(--mute)', fontSize: 12.5, marginTop: 2 }}>Which tier, bundle &amp; price actually gets the YES — so you can tune the ladders. Read-only; nothing changes here.</div>
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={days} onChange={(e) => { const d = Number(e.target.value); setDays(d); if (data) run(d); }}
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '7px 9px', fontSize: 13 }}>
            {WINDOWS.map((w) => <option key={w} value={w}>Last {w} days</option>)}
          </select>
          <button className="btn" disabled={busy} onClick={() => run()}>{busy ? 'Crunching…' : '📊 Run report'}</button>
        </div>
      </div>
      {msg && <div style={{ marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>{msg.t}</div>}

      {data && empty && (
        <div style={{ marginTop: 14, padding: '16px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📭</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>No estimates sent yet</div>
          <div style={{ color: 'var(--mute)', fontSize: 13, marginTop: 4 }}>This fills in as your techs send Good/Better/Best ladders. Come back once a few estimates are out.</div>
        </div>
      )}

      {data && !empty && s && (
        <div style={{ marginTop: 14 }}>
          {/* 1 — FUNNEL: the headline. Sent → Viewed → Approved + the two close rates. */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Stage label="Sent" value={f.sent} sub={`last ${data.windowDays} days`} />
            <Stage label="Viewed" value={f.viewed} sub={`${pct(f.viewRate)} of sent`} accent="var(--amber)" />
            <Stage label="Approved" value={f.approved} sub={`${pct(f.closeRateOfViewed)} of viewed · ${pct(f.closeRateOfSent)} of sent`} accent="var(--green)" />
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 6 }}>
            Close rate <strong style={{ color: 'var(--green)' }}>{pct(f.closeRateOfViewed)}</strong> of the customers who opened the estimate said yes.
            {f.declined > 0 && <span> · {f.declined} declined.</span>}
          </div>

          {/* 2 — TIER MIX: the compromise-effect check. Of approved ladders, who chose Good/Better/Best. */}
          {tm.total > 0 ? (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                🪜 Tier mix of approved ladders
                <span style={{ color: 'var(--fg-3)', fontWeight: 400, fontSize: 11.5, marginLeft: 6 }}>based on {tm.total} approval{tm.total === 1 ? '' : 's'} with a tier</span>
              </div>
              <TierBar tier="good" label="Good" count={tm.counts.good} percent={tm.pct.good} hero={heroTier === 'good'} />
              <TierBar tier="better" label="Better" count={tm.counts.better} percent={tm.pct.better} hero={heroTier === 'better'} />
              <TierBar tier="best" label="Best" count={tm.counts.best} percent={tm.pct.best} hero={heroTier === 'best'} />
              {tm.total < 10 && <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>⚠ Small sample — read the trend, not the exact split, until you have more approvals.</div>}
            </div>
          ) : (
            <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--mute)' }}>No tier-picked approvals yet — tier mix appears once customers approve a Good/Better/Best ladder.</div>
          )}

          {/* 3 — AVG APPROVED TICKET */}
          <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Stage label="Avg approved ticket" value={money(s.ticket.avgTicket)} sub={`${s.ticket.approvedCount} approval${s.ticket.approvedCount === 1 ? '' : 's'}`} accent="var(--green)" />
            <Stage label="Total approved $" value={money(s.ticket.totalRevenue)} sub={`last ${data.windowDays} days`} />
          </div>

          {/* 4 — BY BUNDLE / JOB TYPE */}
          {s.byBundle.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>📦 By bundle / job type <span style={{ color: 'var(--fg-3)', fontWeight: 400, fontSize: 11.5 }}>— which ladders convert</span></div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--fg-3)', fontSize: 11 }}>
                      <th style={{ padding: '4px 8px' }}>Bundle</th>
                      <th style={{ padding: '4px 8px', textAlign: 'right' }}>Sent</th>
                      <th style={{ padding: '4px 8px', textAlign: 'right' }}>Approved</th>
                      <th style={{ padding: '4px 8px', textAlign: 'right' }}>Close rate</th>
                      <th style={{ padding: '4px 8px', textAlign: 'right' }}>Avg ticket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.byBundle.map((b) => (
                      <tr key={b.slug} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>{b.slug}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{b.sent}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{b.approved}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: b.closeRate == null ? 'var(--fg-3)' : (b.closeRate >= 50 ? 'var(--green)' : b.closeRate >= 25 ? 'var(--amber)' : 'var(--red)') }}>{pct(b.closeRate)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{money(b.avgTicket)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5 — DECLINE REASONS */}
          {s.declines.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>🚫 Why people say no <span style={{ color: 'var(--fg-3)', fontWeight: 400, fontSize: 11.5 }}>— {f.declined} decline{f.declined === 1 ? '' : 's'}</span></div>
              <div style={{ display: 'grid', gap: 6 }}>
                {s.declines.map((d) => (
                  <div key={d.reason} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 11px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--fg-1)' }}>{d.reason}</span>
                    <span style={{ fontWeight: 800, color: 'var(--red)' }}>{d.count}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ color: 'var(--fg-3)', fontSize: 11, marginTop: 12 }}>
            Real counts from sent estimates over the last {data.windowDays} days. Read-only — tune your ladders in the Bundle Builder above.
          </div>
        </div>
      )}
    </div>
  );
}

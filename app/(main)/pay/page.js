import { requirePerm } from '@/lib/guard';
import RequestAdvance from './RequestAdvance';

export const dynamic = 'force-dynamic';

// My Pay — ported from the live iPad SPA (Dispatch_Sheet/CB_Dispatch_TechIpadHtml_v1.js, pane-pay).
// The live screen is a designed prototype on sample figures; this keeps that fidelity and isolates ALL
// numbers in `pay` below so the live payroll feed (Tech Sheet "My Jobs" col P → Supabase) drops in here
// with no markup changes. Pay formula (verbatim, Tech Sheet Code.js): Subtotal = Revenue − dispatch fees
// − material×markup; Commission = Subtotal × rate; + material premium + PTO/holiday + bonuses − deductions.
const SAMPLE = {
  weekLabel: 'May 25–31',
  currentWeek: 1847.5, jobs: 14, hours: 38, locks: { done: 4, total: 6 },
  available: 252, lastWeek: 2103.4, lastWeekDelta: '+$255.90 vs avg',
  ytd: 41250, ytdWeeks: 22, ytdDelta: '+8% vs last year',
  payType: 'Commission', payTypeNote: 'your hourly base · vacation + holiday only',
  rank: 2, rankDelta: '↑ 3 from last week',
  fuel: { van: 'Van #14', gal: 23.4, spent: 84.62, miles: 338, mpg: 14.4, onTrack: true },
  margins: [
    { job: 'J-1227 Pierce FB · $1,840', state: 'good', label: '🟢 GOOD' },
    { job: 'J-1224 Henderson · $425', state: 'good', label: '🟢 GOOD' },
    { job: '104808 Reynolds · $185', state: 'good', label: '🟢 GOOD' },
    { job: '104812 Jane (in progress)', state: 'good', label: '🟢 ON TRACK' },
    { job: 'J-1219 Murphy · $285 (📞 callback)', state: 'warn', label: '🔴 ⬆ +$28 to GREEN' },
    { job: 'J-1220 Mason · $185', state: 'bad', label: '🔴 ⬆ +$48 to GREEN' },
    { job: 'J-1228 Brown · $245 (🐀 doc fraud)', state: 'bad', label: '🔴 ⬆ +$113 to GREEN' },
  ],
  breakdown: [
    { ico: '📈', lbl: 'Revenue collected this week (14 jobs)', amt: '$5,840.00', strong: true },
    { ico: '🏷', lbl: 'Less dispatch fees · 1 job × $125 cap', amt: '−$125.00', dim: true },
    { ico: '🔧', lbl: 'Less material at 2× markup (≤$399 jobs · $600 cost)', amt: '−$1,200.00', dim: true },
    { ico: '🔩', lbl: 'Less material at 1.5× markup (>$399 jobs · $450 cost)', amt: '−$675.00', dim: true },
  ],
};

const usd = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const MARGIN_BG = { good: '#4caf50', warn: '#ff8a65', bad: '#ff5252' };

export default async function Pay() {
  // Techs/helpers/foreman (own pay) + owner/gm/accounting (financials) + office (changeStatus) may view.
  await requirePerm('seeOwnPayOnly', 'seeFinancials', 'changeStatus');
  const p = SAMPLE;
  const lockPct = Math.round((p.locks.done / p.locks.total) * 100);

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="h1" style={{ marginBottom: 2 }}>💵 My Pay · Week of {p.weekLabel}</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>Sample view — live payroll sync (Tech Sheet → Supabase) wires next. Layout + formula are the real ones.</div>

      {/* HERO — current week + lock checkpoints + earned-wage advance */}
      <div className="card card-amber">
        <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Current Week</div>
        <div style={{ fontSize: 44, fontWeight: 800, color: 'var(--amber)', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.05 }}>{usd(p.currentWeek)}</div>
        <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>Gross before deductions · {p.jobs} jobs · {p.hours} hr logged</div>
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 8, borderRadius: 6, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div style={{ width: `${lockPct}%`, height: '100%', background: 'var(--green)' }} />
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{p.locks.done}/{p.locks.total} 🔒 lock checkpoints complete</div>
        </div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--amber-dim)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 10, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>💰 Earned &amp; Available Now</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green-bright)', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{usd(p.available)}</div>
            <div style={{ fontSize: 10, color: 'var(--fg-3)' }}>30% of net earned · max 2/wk · standard ACH $0 · instant $2.50</div>
          </div>
          <RequestAdvance available={usd(p.available)} />
        </div>
      </div>

      {/* 4 STAT CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 12 }}>
        {[
          { h: 'Last Week', v: usd0(p.lastWeek), d: p.lastWeekDelta, dc: 'var(--green)' },
          { h: `YTD (${p.ytdWeeks} weeks)`, v: usd0(p.ytd), d: p.ytdDelta, dc: 'var(--green)' },
          { h: 'Pay Type', v: p.payType, d: p.payTypeNote, dc: 'var(--fg-3)', small: true },
          { h: 'Rank This Week', v: `#${p.rank}`, d: p.rankDelta, dc: '#58a6ff' },
        ].map((c) => (
          <div key={c.h} className="card" style={{ padding: 14 }}>
            <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>{c.h}</div>
            <div style={{ fontWeight: 800, fontSize: c.small ? 15 : 22, marginTop: 4, fontFamily: c.small ? undefined : "'JetBrains Mono', monospace" }}>{c.v}</div>
            <div style={{ fontSize: 11, color: c.dc, marginTop: 2 }}>{c.d}</div>
          </div>
        ))}
      </div>

      {/* WEEKLY FUEL — anti fuel-card-theft */}
      <div className="card" style={{ marginTop: 12, background: 'linear-gradient(135deg, #1a3a3a 0%, var(--surface-1) 100%)', border: '1px solid #26c6da' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 22 }}>⛽</span>
          <strong style={{ color: '#80deea', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em' }}>Weekly Fuel · {p.fuel.van}</strong>
          {p.fuel.onTrack && <span style={{ background: '#4caf50', color: 'white', padding: '1px 7px', borderRadius: 9, fontSize: 9, fontWeight: 700, marginLeft: 'auto' }}>✓ ON TRACK</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 10 }}>
          {[[p.fuel.gal, 'Gal purchased', 'var(--fg-1)'], [usd(p.fuel.spent), 'Spent', 'var(--fg-1)'], [p.fuel.miles, 'Miles driven', 'var(--fg-1)'], [p.fuel.mpg, 'MPG · within ±5%', '#4caf50']].map(([v, l, col]) => (
            <div key={l}><div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 800, color: col }}>{v}</div><div style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase' }}>{l}</div></div>
          ))}
        </div>
        <div style={{ background: 'rgba(38,198,218,0.08)', borderLeft: '3px solid #26c6da', padding: '8px 10px', fontSize: 11, color: 'var(--fg-2)', lineHeight: 1.6, borderRadius: '0 4px 4px 0' }}>
          🛡 <strong style={{ color: '#80deea' }}>Anomaly check:</strong> Expected ~23.5 gal for 338mi at 14mpg. Actual {p.fuel.gal} gal. <strong style={{ color: '#4caf50' }}>Within tolerance ✓</strong>
          <br /><span style={{ fontSize: 10, color: 'var(--fg-3)' }}>If usage exceeds expected by 15%, the system pulls GPS via FleetSharp at each fuel timestamp to verify the van was at the station.</span>
        </div>
      </div>

      {/* PER-JOB MARGIN */}
      <div className="card" style={{ marginTop: 12, background: 'linear-gradient(135deg, #1a3a2a 0%, var(--surface-1) 100%)', border: '1px solid #4caf50' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 22 }}>📊</span>
          <strong style={{ color: '#a5d6a7', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em' }}>Per-job margin · this week</strong>
          <span style={{ background: '#4caf50', color: 'white', padding: '1px 7px', borderRadius: 9, fontSize: 9, fontWeight: 700, marginLeft: 'auto' }}>✓ Crown territory</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-2)', marginBottom: 8 }}>🟢 GREEN ≥55% Crown territory · 🔴 RED below w/ “+$X needed to hit 55%”</div>
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
          {p.margins.map((m, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '5px 0', borderBottom: i < p.margins.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
              <span style={{ color: 'var(--fg-2)' }}>{m.job}</span>
              <span style={{ background: MARGIN_BG[m.state], color: 'white', padding: '2px 10px', borderRadius: 8, fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap' }}>{m.label}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: '#a5d6a7', marginTop: 8, lineHeight: 1.5, background: 'rgba(76,175,80,0.06)', borderLeft: '3px solid #4caf50', padding: '6px 10px', borderRadius: '0 4px 4px 0' }}>
          ✅ <strong>GREEN = Crown territory · qualifies for the +$150 Corn bonus.</strong> Red jobs are bleeding profit — fix: stop quoting parts at cost · add 30% markup minimum.
        </div>
      </div>

      {/* CORN + TURD PAY COACH */}
      <div className="card" style={{ marginTop: 12, background: 'linear-gradient(135deg, #2a1a0a 0%, var(--surface-1) 100%)', border: '2px solid var(--amber)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 22 }}>🌽👑</span><span style={{ color: 'var(--fg-3)' }}>·</span><span style={{ fontSize: 22 }}>💩🏆</span>
          <strong style={{ color: 'var(--amber)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em' }}>Corn + Turd · Pay Coach · This Week</strong>
          <span style={{ background: 'var(--amber)', color: '#1a1a1a', padding: '1px 7px', borderRadius: 9, fontSize: 9, fontWeight: 700, marginLeft: 'auto' }}>Roast: R</span>
        </div>
        <div style={{ background: 'rgba(76,175,80,0.08)', borderLeft: '4px solid #4caf50', padding: '10px 12px', marginBottom: 8, borderRadius: '0 6px 6px 0', fontSize: 12, color: 'var(--fg-1)', lineHeight: 1.6 }}>
          <div style={{ fontSize: 10, color: '#4caf50', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>🌽👑 Corn Crown says · what you killed</div>
          <strong>Pierce ($1,840 FB · GREEN).</strong> 3.5h on-site, 12 photos, 5★ review, 3 receipts clean. <strong style={{ color: '#4caf50' }}>$405 landed in YOUR pocket from ONE job</strong> — best ticket this month.<br />
          <strong>On-time streak: 6 days.</strong> One day ahead of Tech #1. Don’t blow it Monday — they’re coming for you.
        </div>
        <div style={{ background: 'rgba(255,82,82,0.08)', borderLeft: '4px solid #ff5252', padding: '10px 12px', borderRadius: '0 6px 6px 0', fontSize: 12, color: 'var(--fg-1)', lineHeight: 1.6 }}>
          <div style={{ fontSize: 10, color: '#ff8a80', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>💩🏆 Golden Turd says · what you fumbled</div>
          <strong>J-1228 Brown ($245 · RED · +$113 to 55%).</strong> $169 parts on a $245 ticket — quoted at cost again, and no receipt for the $42 P-trap kit. <strong style={{ color: '#ff8a80' }}>$25 doc-fraud fee deducted.</strong> Third missing receipt this month.<br />
          <strong>J-1219 Murphy callback.</strong> Re-clog in 6 days, didn’t sell the camera scope. <strong style={{ color: '#ff8a80' }}>$72.50 callback deduction.</strong> Sell the scope.
        </div>
        <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--fg-3)', marginTop: 8 }}>Hank reads your My Jobs data Saturdays at noon · roast level set in Settings · NEVER shown to customers</div>
      </div>

      {/* EARNINGS BREAKDOWN */}
      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Earnings Breakdown · how the pay is built</h3>
        {p.breakdown.map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i === 0 ? '2px solid var(--amber-dim)' : '1px solid var(--border)', opacity: l.dim ? 0.85 : 1 }}>
            <span style={{ fontSize: 16 }}>{l.ico}</span>
            <span style={{ flex: 1, fontSize: 12, fontWeight: l.strong ? 700 : 400 }}>{l.lbl}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: l.dim ? 'var(--fg-3)' : 'var(--fg-1)' }}>{l.amt}</span>
          </div>
        ))}
        <div className="muted" style={{ fontSize: 10.5, marginTop: 10, lineHeight: 1.5 }}>
          Commission = (Revenue − dispatch fees − material×markup) × rate, + material premium + PTO/holiday + bonuses − deductions.
          Commission techs are commission-only — the hourly base never stacks on job pay.
        </div>
      </div>
    </div>
  );
}

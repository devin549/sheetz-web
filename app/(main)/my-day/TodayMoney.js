import Link from 'next/link';

// 💰 Today's Money — ported from tech_ipad_v3.html (#myDaySub_earnings, the gold standard): two headline
// cards (Revenue booked / Your pay so far), 4 stats, per-job breakdown with commission, Open Pay, and the
// tech-only coaching block. Wired to real per-tech data; numbers fall back gracefully when a tech isn't
// linked to a pay profile. TECH-ONLY surface (hidden when the iPad is handed to a customer).
const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtTime = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const mono = "'JetBrains Mono', monospace";

export default function TodayMoney({
  revenue = 0, justNow = null, paySoFar = 0, payKnown = false,
  jobsDone = 0, avgTicket = 0, vsGoalPct = null, memberships = 0,
  breakdown = [], opportunity = 0, dailyRevenue = 0, payHref = '/pay',
}) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 12, margin: '2px 0 14px' }}>
        Your day so far · only you see this — hidden when you hand the iPad to a customer.
      </div>

      {/* HEADLINE NUMBERS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 14 }}>
        {/* Revenue card: faint mint tint over var(--surface-1), so the card is DARK in dark mode but CREAM in
            light mode. var(--green*) tokens adapt to both (light-green on dark / dark-green on cream); a fixed
            light-mint hex like the HTML's would wash out in LIGHT mode (the web app has no inline-style override). */}
        <div style={{ background: 'linear-gradient(135deg,rgba(46,230,160,0.14),rgba(46,230,160,0.03))', border: '1px solid var(--green-bright)', borderRadius: 12, padding: '14px 16px', boxShadow: '0 0 14px rgba(46,230,160,0.18)' }}>
          <div style={{ fontSize: 10, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 800 }}>Revenue booked today</div>
          <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 800, color: 'var(--green-bright)', textShadow: '0 0 10px rgba(105,240,174,0.4)' }}>{money(revenue)}</div>
          <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>{justNow ? `+${money(justNow.amount)} just now from ${justNow.name}${justNow.jobNumber ? ` · ${justNow.jobNumber}` : ''}` : 'closed jobs booked to you today'}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg,var(--amber-deep,#3a2600),var(--surface-1))', border: '1px solid var(--amber)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 800 }}>Your pay so far</div>
          <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 800, color: 'var(--amber)' }}>{payKnown ? money(paySoFar) : '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{payKnown ? 'commission on closed jobs · advance up to half in Pay' : 'link your pay profile to see commission'}</div>
        </div>
      </div>

      {/* SECONDARY STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { v: jobsDone, c: 'var(--fg-1)', label: 'Jobs done' },
          { v: money(avgTicket), c: 'var(--amber)', label: 'Avg ticket' },
          { v: vsGoalPct == null ? '—' : `${vsGoalPct >= 0 ? '+' : ''}${vsGoalPct}%`, c: vsGoalPct != null && vsGoalPct >= 0 ? 'var(--green-bright)' : 'var(--red)', label: 'vs goal' },
          { v: memberships, c: 'var(--amber)', label: 'Membership' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 12px', textAlign: 'center' }}>
            <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* PER-JOB BREAKDOWN */}
      <div style={{ fontSize: 10, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700, margin: '0 0 8px' }}>Where it came from</div>
      {breakdown.length === 0 ? (
        <div className="card muted" style={{ fontSize: 13 }}>Nothing closed yet today.</div>
      ) : breakdown.map((j) => (
        <Link key={j.id} href={`/job/${j.id}`} style={{ background: 'var(--surface-1)', border: `1px solid ${j.live ? 'var(--amber)' : 'var(--border)'}`, borderRadius: 8, padding: '10px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', boxShadow: j.live ? '0 0 10px rgba(255,179,0,0.12)' : 'none' }}>
          <span style={{ background: j.live ? 'rgba(255,179,0,0.2)' : 'rgba(76,175,80,0.2)', color: j.live ? 'var(--amber)' : 'var(--green)', padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap' }}>{j.live ? '🏠 ON-SITE' : '✓ DONE'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}{j.jobType ? ` · ${j.jobType}` : ''}</div>
            <div style={{ fontSize: 10, color: 'var(--fg-3)' }}>{[j.jobNumber, fmtTime(j.time), j.live ? 'in progress' : ''].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ fontFamily: mono, fontSize: 13, color: 'var(--fg-2)' }}>{money(j.amount)}</div>
          {payKnown && j.commission > 0 ? <div style={{ fontFamily: mono, fontSize: 12, color: 'var(--green-bright)', fontWeight: 700 }}>+{money(j.commission)}</div> : null}
        </Link>
      ))}

      <Link href={payHref} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 12, background: 'var(--surface-2)', border: '1px solid var(--amber-dim)', color: 'var(--amber)', padding: 11, borderRadius: 10, fontSize: 13, fontWeight: 700, textAlign: 'center', textDecoration: 'none' }}>💵 Open Pay · advances, week total, paycheck →</Link>

      {/* COACHING & OPPORTUNITY (tech-only) */}
      <div style={{ marginTop: 22, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={{ fontSize: 10, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700, marginBottom: 10 }}>🔒 Coaching &amp; opportunity · only you see this</div>
        <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>📊 Today</div>
          {[
            ['Revenue', money(dailyRevenue || revenue)],
            ['Still to earn', money(opportunity)],
            ['Memberships', `${memberships} sold`],
            ['Avg ticket', money(avgTicket)],
            ['vs Goal', vsGoalPct == null ? '—' : `${vsGoalPct >= 0 ? '+' : ''}${vsGoalPct}%`],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}>
              <span className="muted">{k}</span><span style={{ fontWeight: 700, fontFamily: mono, color: k === 'vs Goal' ? 'var(--amber)' : 'var(--fg-1)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

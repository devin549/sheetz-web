import Link from 'next/link';

// 📅 Week — ported from tech_ipad_v3.html (#myDaySub_jobs): a weekly stats header + this week's jobs
// grouped by day (CB week = Sun 00:00 → Sat 23:59). Denser than the Today cards, Tech-Sheet style.
// Wired to real data; "Your pay" = commission via the pay engine (— until the tech is linked to a profile).
const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const money2 = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTime = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const mono = "'JetBrains Mono', monospace";

const STAT = (v, c, label) => ({ v, c, label });

export default function WeekView({ weekLabel = '', stats = {}, days = [], payKnown = false }) {
  const cells = [
    STAT(stats.jobs ?? 0, 'var(--amber)', 'Jobs'),
    STAT(stats.hours ? `${stats.hours}h` : '—', 'var(--amber)', 'Hours'),
    STAT(money(stats.revenue), 'var(--green-bright)', 'Revenue'),
    STAT(payKnown ? money(stats.pay) : '—', 'var(--green-bright)', 'Your Pay'),
    STAT(money(stats.avg), 'var(--amber)', 'Avg Ticket'),
    STAT(stats.rating ? `${stats.rating}★` : '—', 'var(--amber)', 'Rating'),
  ];
  return (
    <div>
      {/* WEEKLY STATS HEADER */}
      <div style={{ background: 'linear-gradient(135deg, var(--amber-deep,#3a2600) 0%, var(--surface-1) 100%)', border: '1px solid var(--amber)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700, marginBottom: 8 }}>{weekLabel}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10 }}>
          {cells.map((s, i) => (
            <div key={i}>
              <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 800, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {days.length === 0 && <div className="card muted" style={{ fontSize: 13 }}>No jobs scheduled this week.</div>}

      {days.map((d) => (
        <div key={d.key}>
          <div style={{ fontSize: 10, color: d.isToday ? 'var(--amber-dim)' : 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700, margin: '14px 0 6px' }}>📅 {d.label}{d.isToday ? ' · Today' : ''}{d.total ? ` · ${money(d.total)}` : ''}</div>
          {d.jobs.map((j) => (
            <Link key={j.id} href={`/job/${j.id}`} style={{ background: 'var(--surface-1)', border: `1px solid ${j.live ? 'var(--amber-dim)' : 'var(--border)'}`, borderRadius: 8, padding: '10px 12px', marginBottom: 6, display: 'grid', gridTemplateColumns: '58px 1fr auto auto auto', gap: 10, alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontFamily: mono, fontSize: 11, color: j.live ? 'var(--amber)' : 'var(--fg-3)', fontWeight: j.live ? 700 : 400 }}>{fmtTime(j.time)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {j.jobNumber && <span style={{ fontSize: 11, color: 'var(--amber-dim)' }}>{j.jobNumber}</span>}
                  <span style={{ background: j.live ? 'rgba(255,179,0,0.2)' : j.done ? 'rgba(76,175,80,0.2)' : 'var(--surface-2)', color: j.live ? 'var(--amber)' : j.done ? '#a5d6a7' : 'var(--fg-3)', padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 800 }}>{j.live ? '🏠 ON-SITE' : j.done ? '✓ DONE' : (j.statusLabel || 'SCHEDULED')}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}{j.jobType ? ` · ${j.jobType}` : ''}</div>
              </div>
              <div style={{ fontFamily: mono, fontSize: 13, color: 'var(--fg-2)', textAlign: 'right' }}>{j.amount ? (j.live ? `est ${money(j.amount)}` : money2(j.amount)) : ''}</div>
              <div style={{ fontFamily: mono, fontSize: 12, color: payKnown && j.commission > 0 ? 'var(--green-bright)' : 'var(--fg-3)', fontWeight: 700, textAlign: 'right' }}>{j.live ? 'pending' : (payKnown && j.commission > 0 ? `+${money(j.commission)}` : '')}</div>
              <div style={{ fontSize: 14 }}>›</div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

import Link from 'next/link';
import { requirePerm } from '@/lib/guard';
import ReferralShare from './ReferralShare';

export const dynamic = 'force-dynamic';

// Marketing · My Referrals — ported from pane-mkt. Referral code (copy/share) + qualification rules +
// stats. Per the SPA, real referral history lives on the office Referral Rewards board until per-tech
// stats land here — so the totals/list are sample (seam = stats/recent). Reviews link to /reviews.
function codeFor(name) {
  const first = String(name || 'Tech').trim().split(/\s+/)[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'TECH';
  let h = 0; for (const c of String(name || 'tech')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const suf = (h % 1000).toString().padStart(3, '0');
  return `${first}-${suf}`;
}

const RULES = [
  'NEW customer — not already in the CB system (auto-checked against customers).',
  'Paid job completed — booked + finished + paid. Estimates only = no payout.',
  'No cancel-and-rebook trick — credit reverses if they cancel within 14 days.',
  'One per household — same address = one payout, ever.',
];
const stats = [['This Year', '5', 'qualified referrals'], ['Earned', '$75', 'in CB credits'], ['Pending', '2', 'awaiting paid job'], ['Conversion', '62%', 'above avg 48%']];
const recent = [
  ['Sarah Mitchell · 5/22', '1st paid job done', '+$15 ✓', 'var(--green)'],
  ['Tom Bradley · 5/18', 'scheduled', 'PENDING', 'var(--amber)'],
  ['Lisa Chen · 5/12', '1st paid job done', '+$15 ✓', 'var(--green)'],
  ['Mike Decker · 5/9', 'estimate only · no book', 'DQ · tire kicker', 'var(--fg-3)'],
  ['Karen Hill · 5/3', 'existing customer', 'DQ · not new', 'var(--fg-3)'],
];

export default async function Mkt() {
  const { user, profile } = await requirePerm('seeOwnOnly', 'changeStatus', 'seeCrew');
  const name = profile.name || user.email;
  const code = codeFor(name);

  return (
    <div className="wrap" style={{ maxWidth: 620 }}>
      <div className="h1" style={{ marginBottom: 2 }}>📣 Marketing · My Referrals</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Share your code · $15 to the customer + $15 to you · new customers, paid job required.</div>

      {/* code */}
      <div className="card card-amber">
        <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Your code</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 30, fontWeight: 800, color: 'var(--amber)', letterSpacing: '1px' }}>{code}</div>
        <ReferralShare code={code} />
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Sample view — your live code + history are on the office Referral Rewards board until per-tech stats land here.</div>
      </div>

      {/* qualify rules */}
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Who qualifies for the $15</div>
        {RULES.map((r) => <div key={r} style={{ display: 'flex', gap: 7, fontSize: 12.5, padding: '3px 0' }}><span style={{ color: 'var(--green)' }}>✓</span><span style={{ color: 'var(--fg-2)' }}>{r}</span></div>)}
      </div>

      {/* stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 10 }}>
        {stats.map(([h, v, d]) => (
          <div key={h} className="card" style={{ padding: 14 }}>
            <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</div>
            <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{v}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{d}</div>
          </div>
        ))}
      </div>

      {/* recent */}
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Recent referrals</div>
        {recent.map(([who, what, badge, color]) => (
          <div key={who} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{who}</div><div className="muted" style={{ fontSize: 11 }}>{what}</div></div>
            <span className="pill" style={{ fontSize: 10, color }}>{badge}</span>
          </div>
        ))}
      </div>

      <Link href="/reviews" className="card" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}>
        <span style={{ fontSize: 18 }}>⭐</span><span style={{ fontWeight: 800 }}>My Reviews</span>
        <span className="muted" style={{ fontSize: 12 }}>— Google reviews, ratings, quoted-by-name</span>
        <span style={{ marginLeft: 'auto', color: 'var(--amber)', fontWeight: 800 }}>→</span>
      </Link>
    </div>
  );
}

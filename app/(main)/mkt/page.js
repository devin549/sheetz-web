import Link from 'next/link';
import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import ReferralShare from './ReferralShare';

export const dynamic = 'force-dynamic';

// Marketing · My Referrals — ported from pane-mkt. The code is REAL (per-tech, falls back to a deterministic
// FIRST-NNN); stats + recent list are now REAL too, computed from jobs that booked with this tech's code
// (jobs.referral_code, captured at booking). Reviews link to /reviews.
const REFERRAL_PAYOUT = 15; // $15 CB credit to the tech per qualified (paid) referral
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
const DONE = ['done', 'complete', 'completed', 'closed', 'paid'];
const ACTIVE = ['scheduled', 'enroute', 'on_my_way', 'on_site', 'onsite', 'hold'];
const fmtDay = (iso) => { try { return new Date(iso).toLocaleDateString([], { month: 'numeric', day: 'numeric' }); } catch { return ''; } };

// Pull this tech's real referrals: jobs booked with their code this year.
async function loadReferrals(code) {
  if (!isAdminConfigured || !code) return { ready: true, rows: [] };
  const sb = getSupabaseAdmin();
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
  let res = await sb.from('jobs').select('id, status, amount, scheduled_at, created_at, customers(name)')
    .ilike('referral_code', code).gte('created_at', yearStart).order('created_at', { ascending: false }).limit(60);
  if (res.error && /referral_code|column|schema cache/i.test(res.error.message || '')) return { ready: false, rows: [] };
  if (res.error) return { ready: true, rows: [] };
  const rows = (res.data || []).map((j) => {
    const s = String(j.status || '').toLowerCase();
    const tier = DONE.includes(s) ? 'qualified' : s === 'cancelled' ? 'dq' : ACTIVE.includes(s) ? 'pending' : 'pending';
    return { id: j.id, who: (j.customers && j.customers.name) || 'Customer', when: fmtDay(j.created_at || j.scheduled_at), status: s, tier };
  });
  return { ready: true, rows };
}

export default async function Mkt() {
  const { user, profile } = await requirePerm('seeOwnOnly', 'changeStatus', 'seeCrew');
  const name = profile.name || user.email;
  const code = profile.referral_code || codeFor(name);

  const { ready, rows } = await loadReferrals(code);
  const qualified = rows.filter((r) => r.tier === 'qualified').length;
  const pending = rows.filter((r) => r.tier === 'pending').length;
  const total = rows.length;
  const earned = qualified * REFERRAL_PAYOUT;
  const conversion = total ? Math.round((qualified / total) * 100) : 0;
  const stats = [
    ['This Year', String(qualified), 'qualified referrals'],
    ['Earned', `$${earned}`, 'in CB credits'],
    ['Pending', String(pending), 'awaiting paid job'],
    ['Conversion', total ? `${conversion}%` : '—', total ? 'qualified / sent' : 'no referrals yet'],
  ];
  const tierMeta = { qualified: { what: '1st paid job done', badge: `+$${REFERRAL_PAYOUT} ✓`, color: 'var(--green)' }, pending: { what: 'booked · awaiting paid job', badge: 'PENDING', color: 'var(--amber)' }, dq: { what: 'cancelled', badge: 'DQ', color: 'var(--fg-3)' } };

  return (
    <div className="wrap" style={{ maxWidth: 620 }}>
      <div className="h1" style={{ marginBottom: 2 }}>📣 Marketing · My Referrals</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Share your code · $15 to the customer + $15 to you · new customers, paid job required.</div>

      {/* code */}
      <div className="card card-amber">
        <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Your code</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 30, fontWeight: 800, color: 'var(--amber)', letterSpacing: '1px' }}>{code}</div>
        <ReferralShare code={code} />
        {!ready && <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Run <code>supabase/101_profile_referral_code.sql</code> + ensure bookings capture the code to see live history.</div>}
        {ready && !profile.referral_code && <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>This is your auto code. The office can set a custom one on the Referral Rewards board.</div>}
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

      {/* recent — real */}
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Recent referrals</div>
        {rows.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5, padding: '4px 0' }}>No referrals booked with your code yet this year. Share it on every job — $15 to them, $15 to you.</div>
        ) : rows.slice(0, 12).map((r) => {
          const m = tierMeta[r.tier] || tierMeta.pending;
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.who}{r.when ? ` · ${r.when}` : ''}</div><div className="muted" style={{ fontSize: 11 }}>{m.what}</div></div>
              <span className="pill" style={{ fontSize: 10, color: m.color }}>{m.badge}</span>
            </div>
          );
        })}
      </div>

      <Link href="/reviews" className="card" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}>
        <span style={{ fontSize: 18 }}>⭐</span><span style={{ fontWeight: 800 }}>My Reviews</span>
        <span className="muted" style={{ fontSize: 12 }}>— Google reviews, ratings, quoted-by-name</span>
        <span style={{ marginLeft: 'auto', color: 'var(--amber)', fontWeight: 800 }}>→</span>
      </Link>
    </div>
  );
}

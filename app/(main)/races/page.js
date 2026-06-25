import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { weeklyLeaderboard, weeklyEligibility } from '@/lib/leaderboard';

export const dynamic = 'force-dynamic';

const usd0 = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

// THE RACES — ported from the live iPad SPA (pane-races + pane-board). Tech-only gamification. Figures
// are sample (seam = `r`); live = Owner Sheet rank push / _DB_Challenges. CB amber, plumbing voice.
const r = {
  week: 'May 25 – 31', name: 'You', payType: 'Commission', crown: '$6,500 @ 55%', turd: '$9,500 @ 55%', roast: 'R',
  biggest: { leader: '$4,820', leaderWho: 'Tech #1 · 🌊 FB Sump · 62% mar', you: '$2,140', gap: '$2,680', bonus: '+$50' },
  challenges: [
    { icon: '🍔', title: 'First to $1K Today', prize: "Lunch · Devin's tab", desc: 'First tech to clear $1,000 NET today (after parts + pay). Counts profit, not the sale. Resets 6am.', progress: 'You (net): $680 / $1,000 · $320 to go' },
    { icon: '💧', title: 'Hybrid Heater Bounty', prize: '+$100', desc: 'Sell a hybrid water heater this week. First to log + manager-approve gets $100.', progress: '⏳ Expires in 6 days · open to all' },
  ],
  dq: [['LATE', '0 / 0', 'any late = DQ'], ['1-3★ REVIEW', '0 / 0', 'any low ★ = DQ'], ['<55% MARGIN', '0 / 0', 'any sub-55% = DQ'], ['📞 CALLBACK', '1 / 1', '1 more = DQ']],
  rank: 2, you$: '$1,847.50', toFirst: '$256',
  board: [
    { n: 1, who: 'Brandon Parks', amt: '$2,103.40' }, { n: 2, who: 'You', amt: '$1,847.50', me: true },
    { n: 3, who: 'Dylan Hasson', amt: '$1,640.20' }, { n: 4, who: 'Elmer Rader', amt: '$1,425.00' }, { n: 5, who: 'Kade Dow', amt: '$1,308.75' },
  ],
  awards: ['👑 Booking King — Brandon (12 same-day adds)', '🌊 FloodBusterz — Matt (1 approved · $1,840)', '📷 Photo King — Dylan (87 photos)', '🤝 HHWP MVP — Matt', '⭐ Highest CSAT — Elmer (4.95)'],
};

export default async function Races() {
  const { user, profile } = await requirePerm('seeOwnPayOnly', 'seeOwnOnly', 'changeStatus');
  const name = profile.name || user.email;

  // Live leaderboard from this week's jobs (revenue + completions). Falls back to sample if unavailable.
  let board = r.board, rank = r.rank, you$ = r.you$, toFirst = r.toFirst, live = false;
  if (isAdminConfigured) {
    const lb = await weeklyLeaderboard(getSupabaseAdmin(), name, Date.now());
    if (lb.available && !lb.empty) {
      live = true;
      board = lb.rows.slice(0, 8).map((b) => ({ n: b.n, who: b.me ? 'You' : b.who, amt: usd0(b.revenue), me: b.me }));
      if (lb.you) { rank = lb.you.rank; you$ = usd0(lb.you.revenue); toFirst = usd0(lb.you.toFirst); }
      else { rank = '—'; you$ = '$0'; toFirst = usd0(lb.rows[0].revenue); }
    }
  }
  // Owner-managed live bounties/weekly awards (active rows from the awards catalog).
  let liveAwards = [];
  let elig = { available: false };
  if (isAdminConfigured) {
    try { const { data } = await getSupabaseAdmin().from('awards').select('id, title, icon, amount_cents, points, description').eq('active', true).in('kind', ['bounty', 'weekly']).order('sort', { ascending: true }); liveAwards = data || []; } catch (_) {}
    elig = await weeklyEligibility(getSupabaseAdmin(), { techId: profile.tech_id, name }, Date.now());
  }
  // DQ rows — LATE + CALLBACK are real when eligibility loaded; review/margin stay sample until those feeds land.
  const dq = elig.available
    ? [['LATE', `${elig.late} / 0`, 'any late = DQ'], ['1-3★ REVIEW', '0 / 0', 'any low ★ = DQ'], ['<55% MARGIN', '0 / 0', 'any sub-55% = DQ'], ['📞 CALLBACK', `${elig.callbacks} / 0`, 'any = DQ']]
    : r.dq;
  const eligible = elig.available ? elig.eligible : true;
  const strikes = elig.available ? (elig.late + elig.callbacks) : 0;
  return (
    <div className="wrap" style={{ maxWidth: 640 }}>
      <div className="card" style={{ background: 'linear-gradient(135deg, color-mix(in oklab, var(--amber) 18%, var(--surface-1)) 0%, #2a1a0a 100%)', border: '1px solid var(--amber)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 32 }}>🏁</span>
          <div>
            <div style={{ fontSize: 11, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>The Races · Week of {r.week}</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{name} · {r.payType}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>🌽 Crown {r.crown} · 💩 Turd {r.turd} · roast {r.roast}</div>
          </div>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>{live ? '🟢 Leaderboard is LIVE (this week’s revenue). Bounties + biggest-ticket are sample until those feeds wire.' : 'Sample — live rank feed wires when this week has completed jobs.'}</div>

      {/* Biggest ticket */}
      <div className="card" style={{ marginTop: 10, border: '2px solid var(--amber)', background: 'linear-gradient(135deg,rgba(255,179,0,0.14),rgba(255,179,0,0.04))' }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🏆 Biggest Ticket — this week</div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 28, fontWeight: 800, color: 'var(--amber)' }}>{r.biggest.leader}</div>
        <div className="muted" style={{ fontSize: 12 }}>{r.biggest.leaderWho}</div>
        <div style={{ fontSize: 12.5, marginTop: 6 }}>You: <strong>{r.biggest.you}</strong> · gap {r.biggest.gap} · current pace could close it <span className="pill" style={{ color: 'var(--green)' }}>🥇 {r.biggest.bonus} bonus</span></div>
      </div>

      {/* Weekly challenges */}
      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--amber-dim)' }}>Weekly Challenges · live bounties</div>
        {r.challenges.map((c) => (
          <div key={c.title} className="card" style={{ borderLeft: '3px solid var(--amber)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 20 }}>{c.icon}</span><strong>{c.title}</strong><span className="pill" style={{ marginLeft: 'auto', color: 'var(--green)' }}>{c.prize}</span></div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{c.desc}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', marginTop: 4 }}>{c.progress}</div>
          </div>
        ))}
      </div>

      {/* Live bounties from the office (owner-managed) */}
      {liveAwards.length > 0 && (
        <div className="card" style={{ marginTop: 10, borderLeft: '3px solid var(--green)' }}>
          <div style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--green)', marginBottom: 8 }}>🟢 Live bounties from the office</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {liveAwards.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 20 }}>{a.icon || '🎯'}</span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13 }}>{a.title}</div>{a.description && <div className="muted" style={{ fontSize: 11 }}>{a.description}</div>}</div>
                {(a.amount_cents != null || a.points != null) && <span className="pill" style={{ color: 'var(--green)' }}>{[a.amount_cents != null ? '$' + (a.amount_cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '', a.points != null ? `${a.points} XP` : ''].filter(Boolean).join(' · ')}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Eligibility (DQ) — being late this week loses your awards */}
      <div className="card" style={{ marginTop: 10, borderLeft: `3px solid ${eligible ? 'var(--green)' : 'var(--red)'}` }}>
        <div style={{ fontWeight: 800, marginBottom: 8, color: eligible ? 'var(--green)' : 'var(--red)' }}>
          {eligible ? '🟢 All awards live · zero strikes — keep it clean' : `🔴 DQ’d this week — ${strikes} strike${strikes > 1 ? 's' : ''} (any late or callback = out). Clean it up to re-qualify.`}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
          {dq.map(([k, v, note]) => (
            <div key={k} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase' }}>{k}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, fontSize: 16, color: /^0\s/.test(v) ? 'var(--fg-1)' : 'var(--red)' }}>{v}</div>
              <div style={{ fontSize: 9, color: 'var(--fg-3)' }}>{note}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="card" style={{ marginTop: 10, textAlign: 'center', border: '1px solid var(--amber)', background: 'linear-gradient(135deg, color-mix(in oklab, var(--amber) 14%, var(--surface-1)) 0%, var(--surface-1) 100%)' }}>
        <div style={{ fontSize: 11, color: 'var(--amber-dim)', textTransform: 'uppercase', fontWeight: 700 }}>You are</div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 42, fontWeight: 800, color: 'var(--amber)' }}>#{rank}</div>
        <div className="muted" style={{ fontSize: 13 }}>{you$} this week · {rank === 1 ? '🥇 leading the board' : `need ${toFirst} more to take #1`}</div>
      </div>
      <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>
        {board.map((b) => (
          <div key={b.n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, background: b.me ? 'color-mix(in oklab, var(--amber) 14%, var(--surface-2))' : 'var(--surface-2)', border: '1px solid ' + (b.n === 1 ? '#ffd24a' : b.me ? 'var(--amber)' : 'var(--border)') }}>
            <span style={{ fontWeight: 800, color: b.n === 1 ? '#ffd24a' : 'var(--fg-2)', minWidth: 28 }}>#{b.n}</span>
            <span style={{ flex: 1, fontWeight: b.me ? 800 : 600 }}>{b.who}{b.me ? ' (YOU)' : ''}</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{b.amt}</span>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🌟 Other awards this week</div>
        {r.awards.map((a) => <div key={a} className="muted" style={{ fontSize: 12.5, padding: '3px 0' }}>{a}</div>)}
      </div>
    </div>
  );
}

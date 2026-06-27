import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { weeklyLeaderboard, weeklyEligibility } from '@/lib/leaderboard';
import { rankEffect } from '@/lib/rankFx';
import { getConfig, pullsAvailable, budgetSpent } from '@/lib/powerPlunger';
import RankFx from '../RankFx';
import SlotMachine from './SlotMachine';

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
  let board = r.board, rank = r.rank, you$ = r.you$, toFirst = r.toFirst, live = false, fieldTotal = r.board.length;
  if (isAdminConfigured) {
    const lb = await weeklyLeaderboard(getSupabaseAdmin(), name, Date.now());
    if (lb.available && !lb.empty) {
      live = true; fieldTotal = lb.rows.length;
      board = lb.rows.slice(0, 8).map((b) => ({ n: b.n, who: b.me ? 'You' : b.who, amt: usd0(b.revenue), me: b.me }));
      if (lb.you) { rank = lb.you.rank; you$ = usd0(lb.you.revenue); toFirst = usd0(lb.you.toFirst); }
      else { rank = '—'; you$ = '$0'; toFirst = usd0(lb.rows[0].revenue); }
    }
  }
  // Rank celebration (crown/medal/poop/comeback) — same engine as Start of Day. prevRank comes from the
  // tech's last Start-of-Day acknowledgement so "Comeback Run" can fire on the board too.
  let prevRank = null;
  if (isAdminConfigured) {
    try { const { data } = await getSupabaseAdmin().from('tech_shift_log').select('flags, day_key').eq('user_id', user.id).eq('kind', 'sod').order('day_key', { ascending: false }).limit(1); const f = data && data[0] && data[0].flags; if (f && Number.isFinite(Number(f.rank))) prevRank = Number(f.rank); } catch (_) {}
  }
  const fx = rankEffect({ rank: Number(rank), total: fieldTotal, prevRank, seed: name });
  const rowBadge = (n) => n === 1 ? '👑' : n === 2 ? '🥈' : n === 3 ? '🥉' : (fieldTotal > 1 && n === fieldTotal) ? '💩' : '';
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

  // ⚡ Power Plunger — pulls earned this week (5★ reviews + memberships) + budget state. Owner-configurable.
  let ppPulls = 0, ppBudgetTapped = false, ppTopPrize = 15, ppActive = false;
  if (isAdminConfigured) {
    try {
      const sb = getSupabaseAdmin();
      const cfg = await getConfig(sb);
      ppTopPrize = Number(cfg.top_prize) || 15; ppActive = !!cfg.active;
      if (cfg.active) {
        ppPulls = await pullsAvailable(sb, { techId: profile.tech_id, name }, cfg);
        ppBudgetTapped = (await budgetSpent(sb, cfg.budget_period)) >= Number(cfg.budget_cap);
      }
    } catch (_) {}
  }
  return (
    <div className="wrap" style={{ maxWidth: 640 }}>
      <div className="card" style={{ background: 'linear-gradient(135deg, color-mix(in oklab, var(--amber) 18%, var(--surface-1)) 0%, var(--amber-deep) 100%)', border: '1px solid var(--amber)' }}>
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

      {/* 🌽 THE STACK — one revenue counter: 👑 Crown unlock, then 💩 Golden Turd. Big number = $/hr to
          Crown by Saturday. Corn (hype) + Turd (heel) coach in voice. (Corn/Turd lines swap to the
          Anthropic file once Devin sends the file_id.) */}
      {(() => {
        const num = (s) => Number(String(s).replace(/[^0-9.]/g, '')) || 0;
        const revenue = num(you$);
        const crownAmt = num(r.crown) || 6500, turdAmt = num(r.turd) || 9500;
        const crownBonus = 150, turdBonus = 250;
        const gapCrown = Math.max(0, crownAmt - revenue), gapTurd = Math.max(0, turdAmt - revenue);
        const pct = Math.max(2, Math.min(100, Math.round((revenue / turdAmt) * 100)));
        const crownMark = Math.round((crownAmt / turdAmt) * 100);
        const etDay = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay(); // 0=Sun..6=Sat
        const hrsLeft = Math.max(1, (6 - etDay) * 10 + 4); // ~10hr days through Saturday + today's tail
        const rateCrown = Math.round(gapCrown / hrsLeft), rateTurd = Math.round(gapTurd / hrsLeft);
        const crownHit = gapCrown <= 0;
        const cornSays = crownHit
          ? `👑 CROWN unlocked — +$${crownBonus} banked. Don't coast: the Golden Turd's right there for +$${turdBonus} more. Keep climbing.`
          : `You're ${Math.round((revenue / crownAmt) * 100)}% to Crown — ONE solid install grabs the +$${crownBonus} AND keeps you climbing. Don't stop at Crown.`;
        const turdSays = crownHit
          ? `Alright, you earned me. $${gapTurd.toLocaleString()} more and the Golden Turd's yours for +$${turdBonus}. Quit dragging.`
          : `🔒 I'm locked behind Crown. Hit your $${crownAmt.toLocaleString()} first, then I'm yours. Stop leaving money on the floor.`;
        return (
          <div className="card" style={{ marginTop: 10, border: '1px solid var(--amber)' }}>
            <div style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--amber-dim)' }}>🌽 The Stack · this week</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>One revenue counter → 👑 Crown @ {usd0(crownAmt)} unlocks +${crownBonus} → keep climbing → 💩 Turd @ {usd0(turdAmt)} unlocks +${turdBonus} = ${crownBonus + turdBonus} max</div>
            {/* progress bar with Crown + Turd markers */}
            <div style={{ position: 'relative', height: 26, borderRadius: 13, background: 'var(--surface-2)', border: '1px solid var(--border)', overflow: 'hidden', marginTop: 10 }}>
              <div style={{ height: '100%', width: pct + '%', background: 'linear-gradient(90deg,#bfa12e,#ffd24a)', borderRadius: 13 }} />
              <span style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${crownMark}% - 1px)`, width: 2, background: 'var(--fg-1)', opacity: 0.5 }} />
              <span style={{ position: 'absolute', top: '50%', left: `calc(${pct}% - 14px)`, transform: 'translateY(-50%)', fontSize: 16 }}>{crownHit ? '👑' : '🌽'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
              <span style={{ color: 'var(--green)', fontWeight: 700 }}>{usd0(revenue)} · {eligible ? 'GREEN · qualified' : 'DQ’d'}</span>
              <span className="muted">{gapCrown > 0 ? `${usd0(gapCrown)} to Crown` : `${usd0(gapTurd)} to Turd`}</span>
            </div>
            {/* THE BIG NUMBER */}
            <div style={{ marginTop: 10, padding: '14px 12px', borderRadius: 12, background: 'linear-gradient(135deg,#1a1206,#0e0a04)', border: '1px solid var(--amber-dim)', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>🌋 The big number · revenue rate needed</div>
              <div className="cb-glow" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 34, fontWeight: 800, color: 'var(--amber)' }}>{crownHit ? '👑 CROWN' : `$${rateCrown}`}<span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-3)' }}>{crownHit ? '' : '/hour to Crown by Saturday'}</span></div>
              {!crownHit && <div style={{ fontSize: 11, color: '#ff8a65', marginTop: 2 }}>{usd0(gapCrown)} gap ÷ {hrsLeft} work hrs left · Turd needs ${rateTurd}/hr</div>}
            </div>
            {/* Corn + Turd coaching */}
            <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, borderLeft: '3px solid var(--green)', background: 'color-mix(in oklab, var(--green) 7%, transparent)', fontSize: 12 }}><strong style={{ color: 'var(--green)' }}>🌽 Mr. Corn:</strong> {cornSays}</div>
            <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 8, borderLeft: '3px solid #8a6d3b', background: 'color-mix(in oklab, #8a6d3b 9%, transparent)', fontSize: 12 }}><strong style={{ color: '#b08b4a' }}>💩 Golden Turd:</strong> {turdSays}</div>
          </div>
        );
      })()}

      {/* Biggest ticket */}
      <div className="card" style={{ marginTop: 10, border: '2px solid var(--amber)', background: 'linear-gradient(135deg,rgba(255,179,0,0.14),rgba(255,179,0,0.04))' }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🏆 Biggest Ticket — this week</div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 28, fontWeight: 800, color: 'var(--amber)' }}>{r.biggest.leader}</div>
        <div className="muted" style={{ fontSize: 12 }}>{r.biggest.leaderWho}</div>
        <div style={{ fontSize: 12.5, marginTop: 6 }}>You: <strong>{r.biggest.you}</strong> · gap {r.biggest.gap} · current pace could close it <span className="pill" style={{ color: 'var(--green)' }}>🥇 {r.biggest.bonus} bonus</span></div>
      </div>

      {/* ⚡ Power Plunger Hour — roll-for-a-bonus slot (real, budget-capped) */}
      {ppActive && <SlotMachine pulls={ppPulls} budgetTapped={ppBudgetTapped} topPrize={ppTopPrize} />}

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

      {/* Leaderboard — your standing, with the same rank celebration as Start of Day */}
      <div className="card cb-king-card" style={{ position: 'relative', overflow: 'hidden', marginTop: 10, textAlign: 'center',
        border: `2px solid ${fx.tier === 'king' ? '#ffd24a' : fx.tier === 'basement' ? '#c98a2a' : 'var(--amber)'}`,
        background: 'linear-gradient(135deg, color-mix(in oklab, var(--amber) 14%, var(--surface-1)) 0%, var(--surface-1) 100%)' }}>
        <RankFx fireworks={fx.fx === 'fireworks'} confetti={fx.fx === 'confetti' || fx.comebackExtra} />
        <div style={{ position: 'relative', zIndex: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--amber-dim)', textTransform: 'uppercase', fontWeight: 700 }}>You are</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span className={fx.tier === 'king' ? 'cb-bob' : fx.tier === 'basement' ? 'cb-wobble' : ''} style={{ fontSize: 30 }}>{fx.badge}</span>
            <span className="cb-glow" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 42, fontWeight: 800, color: fx.tier === 'king' ? '#ffd24a' : fx.tier === 'basement' ? '#c98a2a' : 'var(--amber)' }}>#{rank}</span>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>{you$} this week · {Number(rank) === 1 ? '🥇 leading the board' : fx.tier === 'basement' ? fx.sub : `need ${toFirst} more to take #1`}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#1a1206', background: fx.tier === 'king' ? '#ffd24a' : fx.tier === 'basement' ? '#c98a2a' : 'var(--amber)', padding: '3px 10px', borderRadius: 20 }}>{fx.label}</span>
            {fx.comebackLabel && <span className="cb-pop" style={{ fontSize: 11, fontWeight: 800, color: 'var(--green-bright)', background: 'color-mix(in oklab, var(--green) 20%, var(--surface-1))', padding: '3px 10px', borderRadius: 20, border: '1px solid var(--green)' }}>{fx.comebackLabel}</span>}
          </div>
        </div>
      </div>
      {/* 🏁 THIS WEEK'S RACE · REVENUE — horizontal racing lanes (ported from the HTML): each tech races a
          bar toward the leader's pace = the finish line; plunger leads, poop trails. */}
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--amber-dim)', marginBottom: 8 }}>🏁 This week's race · revenue</div>
        {(() => {
          const revs = board.map((b) => Number(String(b.amt).replace(/[^0-9.]/g, '')) || 0);
          const maxRev = Math.max(1, ...revs);
          return board.map((b, i) => {
            const pct = Math.max(5, Math.round((revs[i] / maxRev) * 100));
            const last = fieldTotal > 1 && b.n === fieldTotal;
            const racer = b.n === 1 ? '🪠' : last ? '💩' : '🪠';
            const grad = b.n === 1 ? 'linear-gradient(90deg,#bfa12e,#ffd24a)' : b.me ? 'linear-gradient(90deg,#9c7b2e,#e0b94a)' : 'linear-gradient(90deg,#8a7a5e,#b6a489)';
            return (
              <div key={b.n} style={{ marginBottom: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 2 }}>
                  <span style={{ fontWeight: b.me ? 800 : 600 }}>{rowBadge(b.n) ? rowBadge(b.n) + ' ' : ''}{b.who}{b.me ? ' (YOU)' : ''}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{b.amt}</span>
                </div>
                <div style={{ position: 'relative', height: 22, borderRadius: 11, background: 'var(--surface-2)', border: '1px solid ' + (b.me ? 'var(--amber)' : 'var(--border)'), overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: pct + '%', background: grad, borderRadius: 11 }} />
                  <span style={{ position: 'absolute', top: '50%', left: `calc(${pct}% - 16px)`, transform: 'translateY(-50%)', fontSize: 15 }}>{racer}</span>
                </div>
              </div>
            );
          });
        })()}
        <div className="muted" style={{ fontSize: 10.5 }}>🏁 leader's pace = finish line · catch them by Saturday</div>
      </div>
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🌟 Other awards this week</div>
        {r.awards.map((a) => <div key={a} className="muted" style={{ fontSize: 12.5, padding: '3px 0' }}>{a}</div>)}
      </div>
    </div>
  );
}

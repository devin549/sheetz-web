import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { techXp, weeklyLeaderboard, onTimeStreak } from '@/lib/leaderboard';
import { getConfig, pullsAvailable, budgetSpent } from '@/lib/powerPlunger';
import SlotMachine from '../races/SlotMachine';

export const dynamic = 'force-dynamic';

// 👑 My Level — the Plunger progression home: level + XP to next, rank, on-time streak, and the ⚡ Power
// Plunger pull (moved here from the top ribbon so it has one home). Real data; honest when a stat's empty.
export default async function Level() {
  const { profile, user } = await requirePerm('changeStatus', 'seeOwnOnly');
  const name = profile.name || user.email;
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">👑 My Level</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  const sb = getSupabaseAdmin();

  const [xp, lb, st] = await Promise.all([
    techXp(sb, { techId: profile.tech_id, name }),
    weeklyLeaderboard(sb, name, Date.now()),
    onTimeStreak(sb, { techId: profile.tech_id, name }, Date.now()),
  ]);
  const level = xp.available ? xp.level : 1;
  const pct = xp.available ? xp.pct : 0;
  const tier = xp.available ? xp.tier : 'Rookie';
  const totalXp = xp.available ? xp.xp : 0;
  const nextAt = xp.available ? xp.nextAt : null;
  const toNext = nextAt != null ? Math.max(0, nextAt - totalXp) : null;
  const rank = lb.available && lb.you ? lb.you.rank : null;
  const fieldSize = lb.available ? (lb.total || 0) : 0;
  const streak = st.available ? st.streak : 0;

  // ⚡ Power Plunger pull — earned pulls + budget state (same engine the ribbon used).
  let pp = { active: false, pulls: 0, budgetTapped: false, topPrize: 15 };
  try {
    const cfg = await getConfig(sb);
    pp.topPrize = Number(cfg.top_prize) || 15; pp.active = !!cfg.active;
    if (cfg.active) { pp.pulls = await pullsAvailable(sb, { techId: profile.tech_id, name }, cfg); pp.budgetTapped = (await budgetSpent(sb, cfg.budget_period)) >= Number(cfg.budget_cap); }
  } catch (_) {}

  return (
    <div className="wrap" style={{ maxWidth: 640 }}>
      <div className="h1" style={{ marginBottom: 2 }}>👑 My Level</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Your Plunger rank climbs as you close jobs and win bounties.</div>

      {/* Hero — level + progress */}
      <div className="card" style={{ background: 'linear-gradient(135deg,#3a2456 0%,#241138 100%)', border: '2px solid #ce8fe0', textAlign: 'center', padding: '18px 16px' }}>
        <div style={{ fontSize: 12, color: '#e1bee7', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800 }}>Plunger · {tier}</div>
        <div style={{ fontSize: 52, fontWeight: 800, color: '#ffd24a', lineHeight: 1, margin: '6px 0' }}>Lvl {level}</div>
        <div style={{ background: 'rgba(255,255,255,0.18)', height: 10, borderRadius: 6, overflow: 'hidden', margin: '10px auto 6px', maxWidth: 360 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#ce8fe0,#ffd24a)' }} />
        </div>
        <div style={{ fontSize: 11.5, color: '#e3cdec' }}>{level >= 10 ? 'Max level — top of the ladder 👑' : `${pct}% to Lvl ${level + 1}${toNext != null ? ` · ${toNext} XP to go` : ''}`}</div>
        <div style={{ fontSize: 10.5, color: '#c2b0cf', marginTop: 2 }}>{totalXp} XP total</div>
      </div>

      {/* Rank + streak */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--amber)' }}>{rank ? `#${rank}` : '—'}</div>
          <div className="muted" style={{ fontSize: 11 }}>this week{fieldSize ? ` · of ${fieldSize}` : ''}</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: streak > 0 ? 'var(--green-bright)' : 'var(--fg-3)' }}>🔥 {streak}</div>
          <div className="muted" style={{ fontSize: 11 }}>day on-time streak</div>
        </div>
      </div>

      {/* ⚡ The pull — now lives here */}
      <SlotMachine pulls={pp.pulls} budgetTapped={pp.budgetTapped} topPrize={pp.topPrize} />

      {/* How to level up */}
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, marginBottom: 6 }}>How you climb</div>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          ✅ Close a job <strong>+10 XP</strong> · 🏆 Win a bounty earns its points · 💜 Memberships &amp; 5★ reviews earn Power Plunger pulls.
        </div>
      </div>
    </div>
  );
}

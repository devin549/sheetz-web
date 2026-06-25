import { requirePerm } from '@/lib/guard';

export const dynamic = 'force-dynamic';

// Vegas · Achievements — ported from pane-vegas. CB Player Card tier ladder (Rookie → Legend) + badges.
// Figures sample (seam = V); live = XP from the week archive / awards engine.
const V = {
  level: 7, name: 'You', xp: 2340, xpMax: 2800, pct: 84,
  tiers: [
    ['🌱', 'Rookie', 'Lvl 1-2'], ['🔧', 'Apprentice', 'Lvl 3-4'], ['🪠', 'Drain Slayer', 'Lvl 5'],
    ['🤠', 'Sewer Sheriff', 'Lvl 6'], ['👑', 'Crown Plunger', 'Lvl 7 (YOU)'], ['🪅', 'Legend', 'Lvl 8-10 (next)'],
  ],
  meTier: 'Crown Plunger',
  legendUnlocks: '$200 quarterly bonus · custom van decal · skip-the-line Friday lunch pick · CB VIP channel',
  earned: ['👑 Crown — 5+ FB this week', '🌊 FloodBuster — 1st FB approval', '🤝 Helper of the Week', '📸 Photo Pro — 50+ photos', '🎯 9 AM Sniper — 5 on-time mornings', '🌟 Sewer Master — 100+ drains'],
  locked: ['🥇 Booking King — 12 same-day adds', '⚡ Power Plunger Hour — 5+ jobs in 4 hrs', '💯 Hundred Club — 100 jobs/month'],
};

export default async function Vegas() {
  await requirePerm('seeOwnPayOnly', 'seeOwnOnly', 'changeStatus');
  return (
    <div className="wrap" style={{ maxWidth: 640 }}>
      <div className="h1" style={{ marginBottom: 2 }}>🎰 Vegas · Achievements</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Climb Rookie → Legend; each tier unlocks real $$$. <em>Sample; live XP next.</em></div>

      {/* Player card */}
      <div className="card" style={{ border: '2px solid var(--amber)', background: 'linear-gradient(135deg, color-mix(in oklab, var(--amber) 18%, var(--surface-1)) 0%, #2a1a0a 60%, var(--surface-1) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ fontSize: 54 }}>👑</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Crown Plunger · Level {V.level}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 800, color: 'var(--amber)' }}>{V.name}</div>
            <div style={{ height: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 4, marginTop: 8, overflow: 'hidden', border: '1px solid var(--amber-dim)' }}>
              <div style={{ height: '100%', width: `${V.pct}%`, background: 'linear-gradient(90deg, var(--amber) 0%, #fff44f 50%, var(--amber) 100%)' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4 }}>{V.pct}% to <strong style={{ color: '#ffeb3b' }}>🪅 LEGEND</strong> · {V.xp.toLocaleString()} / {V.xpMax.toLocaleString()} XP</div>
          </div>
        </div>
      </div>

      {/* Tier ladder */}
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--amber-dim)', marginBottom: 8 }}>Plumber Tier Ladder · CB-only</div>
        <div style={{ display: 'grid', gap: 5 }}>
          {V.tiers.map(([ic, t, lvl]) => {
            const me = t === V.meTier;
            return (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: me ? 'color-mix(in oklab, var(--amber) 16%, var(--surface-2))' : 'var(--surface-2)', border: '1px solid ' + (me ? 'var(--amber)' : 'var(--border)') }}>
                <span style={{ fontSize: 20 }}>{ic}</span>
                <span style={{ flex: 1, fontWeight: me ? 800 : 600, color: me ? 'var(--amber)' : 'var(--fg-1)' }}>{t}</span>
                <span className="muted" style={{ fontSize: 11 }}>{lvl}</span>
              </div>
            );
          })}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>🪅 Legend unlocks: {V.legendUnlocks}</div>
      </div>

      {/* Achievements */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <div className="card">
          <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--green)', marginBottom: 6 }}>✓ Earned</div>
          {V.earned.map((a) => <div key={a} style={{ fontSize: 12, padding: '3px 0' }}>{a}</div>)}
        </div>
        <div className="card">
          <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--fg-3)', marginBottom: 6 }}>🔒 Locked (next up)</div>
          {V.locked.map((a) => <div key={a} className="muted" style={{ fontSize: 12, padding: '3px 0' }}>{a}</div>)}
        </div>
      </div>
    </div>
  );
}

import { requirePerm } from '@/lib/guard';

export const dynamic = 'force-dynamic';

// My Record (Career) — ported from pane-record. Lifetime stats; live = _WeekArchive (never resets).
// Figures sample (seam = CARDS).
const CARDS = [
  ['Total Revenue', '$847,320', 'since 2022-06'],
  ['Total Pay', '$186,408', 'avg $46,602/yr'],
  ['Jobs Closed', '2,184', '$388 avg ticket'],
  ['Avg Rating', '4.82 ⭐', '347 reviews'],
  ['Best Week', '$2,894', 'Week of 2024-09-15'],
  ['Biggest Job', '$5,840', '🌊 FB · Pierce · 2024-11-08'],
  ['Longest Streak', '11 weeks', 'on-time + 5★'],
  ['Memberships Sold', '84', '$420 avg recurring'],
  ['Referrals Earned', '17', '$340 in credits'],
];

export default async function Record() {
  await requirePerm('seeOwnPayOnly', 'seeOwnOnly', 'changeStatus');
  return (
    <div className="wrap" style={{ maxWidth: 640 }}>
      <div className="h1" style={{ marginBottom: 2 }}>🏆 My Record · Career</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Lifetime stats — never resets. <em>Sample; live from your week archive next.</em></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {CARDS.map(([h, v, d]) => (
          <div key={h} className="card" style={{ padding: 14 }}>
            <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</div>
            <div style={{ fontWeight: 800, fontSize: 22, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{v}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

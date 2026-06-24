import { Trophy } from 'lucide-react';
import { money, ACCENT } from './boardTokens';

// Today's Game Plan — office goals (from /settings) measured against the actuals we can compute now
// (booked / avg ticket / QA holds). Goals without live tracking yet are listed as "coming".
export default function BoardTargets({ goals, actuals }) {
  if (!goals || !goals.length) return null;
  const fmt = (v, unit) => (unit === 'dollars' ? money(v) : String(v));

  const missions = goals.filter((g) => actuals[g.key] !== undefined).map((g) => {
    const a = actuals[g.key], t = Number(g.target) || 0;
    if (g.key === 'qa_clear') return { ...g, pct: a === 0 ? 100 : 30, done: a === 0, sub: a === 0 ? 'all clear' : `${a} hold${a === 1 ? '' : 's'} to clear` };
    const pct = t ? Math.min(100, Math.round((a / t) * 100)) : (a > 0 ? 100 : 0);
    return { ...g, pct, done: t > 0 && a >= t, sub: `${fmt(a, g.unit)} / ${fmt(t, g.unit)}` };
  });
  const pending = goals.filter((g) => actuals[g.key] === undefined);
  if (!missions.length) return null;

  return (
    <div className="card" style={{ marginTop: 10, borderTop: `2px solid ${ACCENT}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Trophy size={16} style={{ color: ACCENT }} />
        <span style={{ fontWeight: 800, fontSize: 13 }}>Today&apos;s Game Plan</span>
        <span className="muted" style={{ fontSize: 11 }}>· hit the targets</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {missions.map((m) => (
          <div key={m.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>{m.label}</span>
              {m.done && <span style={{ color: 'var(--green)', fontSize: 12, fontWeight: 800 }}>✓</span>}
            </div>
            <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden', margin: '5px 0 4px' }}>
              <div style={{ height: '100%', width: `${m.pct}%`, background: m.done ? 'var(--green)' : ACCENT, opacity: 0.85 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 11 }}>{m.assignee || ''}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: m.done ? 'var(--green)' : 'var(--fg-2)' }}>{m.sub}</span>
            </div>
          </div>
        ))}
      </div>
      {pending.length > 0 && <div className="muted" style={{ fontSize: 10.5, marginTop: 10 }}>Coming with call/review tracking: {pending.map((g) => g.label).join(' · ')}</div>}
    </div>
  );
}

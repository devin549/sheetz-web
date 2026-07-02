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

  // ONE slim strip, not a band — the board's real estate belongs to the grid (Devin: "seems like a lot
  // all scattered"). Each target is a compact chip with a hairline progress bar under its numbers.
  return (
    <div className="card" style={{ marginTop: 10, padding: '8px 14px', borderLeft: `3px solid ${ACCENT}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 12, color: ACCENT, flexShrink: 0 }}><Trophy size={14} /> GAME PLAN</span>
      {missions.map((m) => (
        <span key={m.key} title={`${m.label}${m.assignee ? ` · ${m.assignee}` : ''}`} style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, minWidth: 110 }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, lineHeight: 1 }}>
            <span className="muted" style={{ fontWeight: 700 }}>{m.label}</span>
            <span style={{ fontWeight: 800, fontFamily: 'var(--mono)', color: m.done ? 'var(--green)' : 'var(--fg-1)', whiteSpace: 'nowrap' }}>{m.done ? '✓ ' : ''}{m.sub}</span>
          </span>
          <span style={{ height: 3, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${m.pct}%`, background: m.done ? 'var(--green)' : ACCENT }} />
          </span>
        </span>
      ))}
      {pending.length > 0 && <span className="muted" style={{ fontSize: 10, marginLeft: 'auto' }}>coming: {pending.map((g) => g.label).join(' · ')}</span>}
    </div>
  );
}

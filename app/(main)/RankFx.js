'use client';

// Celebration overlay for the gamified screens — a short firework burst (#1) and/or a confetti drop
// (top-3 / comeback). Modest + play-once per the spec ("exciting but not huge or distracting"). Particles
// are generated AFTER mount (useEffect) so the server renders an empty layer — no hydration mismatch and
// effects only fire client-side. The parent must be position:relative. Reduced-motion is handled in CSS
// (.cb-spark/.cb-confetti are hidden), so this stays accessible.
import { useEffect, useState } from 'react';

const SPARK = ['#ffd24a', '#FFB300', '#4caf50', '#4f9bff', '#ff8a3d', '#ffffff'];
const CONFETTI = ['#ffd24a', '#FFB300', '#4caf50', '#4f9bff', '#ff5560', '#9c64f4'];

export default function RankFx({ fireworks = false, confetti = false, replayKey = 0 }) {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(true); }, [replayKey]);
  if (!on || (!fireworks && !confetti)) return null;

  const sparks = fireworks ? Array.from({ length: 16 }, (_, i) => {
    const ang = (i / 16) * Math.PI * 2;
    const rad = 64 + (i % 4) * 16;
    return { dx: Math.cos(ang) * rad, dy: Math.sin(ang) * rad - 10, c: SPARK[i % SPARK.length], d: (i % 5) * 0.05 };
  }) : [];
  const bits = confetti ? Array.from({ length: 20 }, (_, i) => ({
    left: (i * 5 + (i % 3) * 3) % 100, c: CONFETTI[i % CONFETTI.length], d: (i % 6) * 0.09, w: 5 + (i % 3) * 2,
  })) : [];

  return (
    <div className="cb-fx-layer" aria-hidden="true">
      {sparks.map((s, i) => (
        <span key={'s' + i} className="cb-spark" style={{ background: s.c, '--dx': `${s.dx}px`, '--dy': `${s.dy}px`, animationDelay: `${s.d}s`, boxShadow: `0 0 6px ${s.c}` }} />
      ))}
      {bits.map((b, i) => (
        <span key={'c' + i} className="cb-confetti" style={{ left: `${b.left}%`, background: b.c, width: b.w, height: b.w + 5, animationDelay: `${b.d}s` }} />
      ))}
    </div>
  );
}

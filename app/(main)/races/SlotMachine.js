'use client';

import { useState } from 'react';
import { pullSlot } from './pullActions';

const SYMS = ['💵', '🪠', '7', '💎', '👑', '🎰', '🔥', '⭐'];
const rnd = () => SYMS[Math.floor(Math.random() * SYMS.length)];

// Power Plunger Hour — roll-for-a-bonus slot. Pulls are EARNED server-side (membership / 5★ review) and the
// payout is decided by the engine under the company budget cap; this just spins + shows the real result.
export default function SlotMachine({ pulls: initialPulls, budgetTapped, topPrize = 15 }) {
  const [pulls, setPulls] = useState(initialPulls || 0);
  const [reels, setReels] = useState(['💵', '🪠', '7']);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);

  const pull = async () => {
    // Always tappable — the server decides the payout (earned pulls + budget). No earned pulls = a "spin for
    // fun" + a nudge to earn one, never a dead button.
    if (spinning) return;
    setSpinning(true); setResult(null);
    const iv = setInterval(() => setReels([rnd(), rnd(), rnd()]), 80);
    const res = await pullSlot();
    setTimeout(() => {
      clearInterval(iv);
      if (res && res.ok) {
        setReels(res.symbols ? res.symbols.split(' ') : [rnd(), rnd(), rnd()]);
        setPulls(typeof res.pullsLeft === 'number' ? res.pullsLeft : pulls - 1);
        setResult({ hit: res.hit, jackpot: res.jackpot, msg: res.msg });
      } else {
        setResult({ hit: false, msg: (res && res.msg) || 'Try again in a sec.' });
      }
      setSpinning(false);
    }, 1500);
  };

  const canPull = !spinning; // always tappable — server gates the real payout
  return (
    <div className="card" style={{ marginTop: 10, textAlign: 'center', background: 'linear-gradient(135deg,#3a2456 0%,#241138 100%)', border: '2px solid #ce8fe0' }}>
      <div style={{ fontSize: 12, color: '#f0d9f7', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800, marginBottom: 10 }}>⚡ Power Plunger Hour · Roll for a Bonus</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
        {reels.map((s, i) => (
          <div key={i} style={{ fontSize: 42, background: 'rgba(0,0,0,0.45)', border: '2px solid #ce8fe0', borderRadius: 10, padding: '6px 14px', minWidth: 56, transition: 'transform .1s', transform: spinning ? 'translateY(-2px)' : 'none' }}>{s}</div>
        ))}
      </div>
      <button onClick={pull} disabled={!canPull} style={{
        background: 'linear-gradient(180deg,#ce8fe0 0%,#7b27ad 100%)',
        color: '#fff', border: 'none', padding: '13px 30px', borderRadius: 8,
        fontSize: 15, fontWeight: 800, cursor: canPull ? 'pointer' : 'default', letterSpacing: '.5px', opacity: spinning ? 0.7 : 1, boxShadow: '0 2px 10px rgba(206,143,224,0.35)' }}>
        {spinning ? '🎰 spinning…' : pulls > 0 ? `🎰 PULL · ${pulls} free roll${pulls > 1 ? 's' : ''}` : '🎰 PULL for a bonus'}
      </button>
      <div style={{ fontSize: 11, color: '#e3cdec', marginTop: 8, lineHeight: 1.4 }}>
        Earn a pull: sell a membership · land a 5★ review · bonuses up to ${topPrize}{budgetTapped ? ' · 💸 budget tapped, resets Sunday' : ''}
      </div>
      {result && (
        <div style={{ marginTop: 10, fontSize: 13.5, fontWeight: 800, color: result.jackpot ? '#ffd24a' : result.hit ? '#7ee787' : '#f0d9f7' }}>{result.msg}</div>
      )}
    </div>
  );
}

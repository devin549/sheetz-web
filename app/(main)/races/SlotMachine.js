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
    if (spinning || pulls <= 0) return;
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

  const canPull = pulls > 0 && !spinning;
  return (
    <div className="card" style={{ marginTop: 10, textAlign: 'center', background: 'linear-gradient(135deg,#2a1a3a 0%,#1a0a2a 100%)', border: '2px solid #ba68c8' }}>
      <div style={{ fontSize: 11, color: '#e1bee7', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: 10 }}>⚡ Power Plunger Hour · Roll for a Bonus</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
        {reels.map((s, i) => (
          <div key={i} style={{ fontSize: 42, background: 'rgba(0,0,0,0.4)', border: '2px solid #ba68c8', borderRadius: 10, padding: '6px 14px', minWidth: 56, transition: 'transform .1s', transform: spinning ? 'translateY(-2px)' : 'none' }}>{s}</div>
        ))}
      </div>
      <button onClick={pull} disabled={!canPull} style={{
        background: canPull ? 'linear-gradient(180deg,#ba68c8 0%,#6a1b9a 100%)' : 'var(--surface-2)',
        color: canPull ? '#fff' : 'var(--fg-3)', border: 'none', padding: '12px 28px', borderRadius: 8,
        fontSize: 14, fontWeight: 800, cursor: canPull ? 'pointer' : 'default', letterSpacing: '.5px' }}>
        {spinning ? '🎰 spinning…' : pulls > 0 ? `🎰 PULL · ${pulls} free roll${pulls > 1 ? 's' : ''} left` : 'No pulls yet — earn one!'}
      </button>
      <div style={{ fontSize: 9, color: 'var(--fg-3)', marginTop: 6 }}>
        Earn a pull: sell a membership · land a 5★ review · bonuses up to ${topPrize}{budgetTapped ? ' · 💸 budget tapped, resets Sunday' : ''}
      </div>
      {result && (
        <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: result.jackpot ? '#ffd24a' : result.hit ? 'var(--green)' : 'var(--fg-2)' }}>{result.msg}</div>
      )}
    </div>
  );
}

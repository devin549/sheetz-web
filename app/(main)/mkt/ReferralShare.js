'use client';

// Referral code copy / iOS share. The code is a display value derived from the tech's name; the LIVE
// redeemable code + history live on the office Referral Rewards board until per-tech stats land here.
import { useState } from 'react';

export default function ReferralShare({ code }) {
  const [copied, setCopied] = useState(false);
  const msg = `Use my Clog Busterz referral code ${code} — $15 off your first paid job, and I get $15 too. clogbusterzplumbing.com`;
  const copy = () => { try { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {} };
  const share = () => { if (navigator.share) navigator.share({ text: msg }).catch(() => {}); else copy(); };
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
      <button onClick={copy} className="btn btn-ghost" style={{ flex: 1, minWidth: 120 }}>{copied ? '✓ Copied' : '📋 Copy code'}</button>
      <button onClick={share} className="btn" style={{ flex: 1, minWidth: 120 }}>📲 Share</button>
    </div>
  );
}

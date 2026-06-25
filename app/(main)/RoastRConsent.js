'use client';

// The Rated-R re-consent modal — shown ANY time R is selected outside onboarding (e.g. a manager setting
// R in Settings). Same warning + thick-skin checkbox as the onboarding gate. onAgree fires only after the
// box is checked and "I AGREE" is tapped.
import { useState } from 'react';

export default function RoastRConsent({ open, onAgree, onCancel, busy }) {
  const [ck, setCk] = useState(false);
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface-0)', border: '1px solid #d32f2f', borderRadius: 16, maxWidth: 520, width: '100%', maxHeight: '94vh', overflow: 'auto' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg,#3a0d0d 0%,#5a1414 100%)', borderRadius: '16px 16px 0 0' }}>
          <span style={{ fontSize: 26 }}>🔥</span>
          <div><h3 style={{ margin: 0, fontSize: 17, color: '#ffcdd2' }}>Rated R — read this first</h3><div style={{ fontSize: 11, color: '#ef9a9a' }}>No mercy. Real profanity. Thick skin required.</div></div>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ background: 'rgba(211,47,47,0.1)', border: '1px solid #d32f2f', borderRadius: 10, padding: '12px 14px', fontSize: 13, lineHeight: 1.55, color: 'var(--fg-1)', marginBottom: 12 }}>
            You picked <strong style={{ color: '#ff8a80' }}>R — ADULT HUMOR</strong>. The no-holds-barred level. It can drop the <strong>f-bomb</strong> (shown as f**k), plus <strong>shit, ass, bullshit, damn, hell</strong> — always aimed at your <em>work and your numbers</em>, never at you as a person, and <strong>NEVER</strong> shown to customers.
          </div>
          <div style={{ border: '2px solid #d32f2f', background: 'rgba(211,47,47,0.06)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--fg-2)', lineHeight: 1.55, marginBottom: 12 }}>
            <strong style={{ color: '#ff8a80' }}>⚠️ Off-limits at EVERY level:</strong> nothing about race, ethnicity, national origin, color, sex, sexual orientation, gender identity, age, religion, disability, pregnancy, veteran status, appearance, weight, or any other protected class. Ever.
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--fg-3)', lineHeight: 1.5, marginBottom: 14 }}>Roast content shows ONLY on the NDA-protected screen — never in a text, email, or anything a customer sees. Drop back to PG-13 or PG any time, no penalty.</div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', background: 'var(--surface-1)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <input type="checkbox" checked={ck} onChange={(e) => setCk(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: '#d32f2f' }} />
            <span style={{ fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.5, fontWeight: 700 }}>I’ve got thick skin. I understand R uses real profanity about my work, and I want it turned on.</span>
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setCk(false); onCancel?.(); }} style={{ flex: 1, background: 'var(--surface-1)', border: '1px solid var(--border-strong)', color: 'var(--fg-2)', padding: 13, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Not now</button>
            <button onClick={() => ck && onAgree?.()} disabled={!ck || busy} style={{ flex: 1.4, background: 'linear-gradient(135deg,#8a2020 0%,#d32f2f 100%)', border: 'none', color: '#fff', padding: 13, borderRadius: 10, fontSize: 13, fontWeight: 900, cursor: ck && !busy ? 'pointer' : 'not-allowed', opacity: ck && !busy ? 1 : 0.45 }}>{busy ? 'Saving…' : 'I AGREE — turn on R'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

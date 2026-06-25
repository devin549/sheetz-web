'use client';

// Command Center PIN gate — shown to owner/supervisors before the sensitive dashboard renders. First time
// (no PIN yet) it asks them to create one; after that it asks them to enter it. On success the server sets
// a 30-minute unlock cookie and the page re-renders into the real Command Center.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setCommandCenterPin, unlockCommandCenter } from './account/actions';

const pinInput = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', padding: '14px', borderRadius: 10, fontSize: 24, textAlign: 'center', letterSpacing: 10, fontFamily: "'JetBrains Mono',monospace" };

export default function CommandCenterPinGate({ hasPin, title }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [err, setErr] = useState('');
  const onlyDigits = (v) => v.replace(/\D/g, '').slice(0, 8);

  const submit = () => {
    setErr('');
    if (pin.length < 4) { setErr('PIN must be 4–8 digits.'); return; }
    if (!hasPin && pin !== pin2) { setErr('The two PINs don’t match.'); return; }
    start(async () => {
      const r = hasPin ? await unlockCommandCenter(pin) : await setCommandCenterPin(pin);
      if (r.ok) router.refresh(); else { setErr(r.msg || 'Try again.'); setPin(''); setPin2(''); }
    });
  };

  return (
    <div className="wrap" style={{ maxWidth: 380, marginTop: 50 }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 44 }}>🔒</div>
        <div className="h1" style={{ margin: '6px 0 2px' }}>{title || 'Command Center'}</div>
        <div className="muted" style={{ fontSize: 12.5 }}>{hasPin ? 'Enter your Command Center PIN to open it.' : 'Set a Command Center PIN — an extra lock on the money/AR view.'}</div>
      </div>
      <div className="card card-amber">
        <input type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(onlyDigits(e.target.value))}
          onKeyDown={(e) => { if (e.key === 'Enter' && hasPin) submit(); }} placeholder="••••" style={pinInput} />
        {!hasPin && (
          <input type="password" inputMode="numeric" value={pin2} onChange={(e) => setPin2(onlyDigits(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="confirm" style={{ ...pinInput, marginTop: 10, fontSize: 18, letterSpacing: 6 }} />
        )}
        {err && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{err}</div>}
        <button onClick={submit} disabled={pending} className="btn" style={{ width: '100%', marginTop: 14, padding: 14, opacity: pending ? 0.6 : 1 }}>
          {pending ? '…' : hasPin ? '🔓 Open Command Center' : 'Set PIN & open'}
        </button>
      </div>
      <div className="muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 12 }}>This is a second lock on top of your login. It re-locks after 30 minutes idle or when you sign out.</div>
    </div>
  );
}

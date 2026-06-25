'use client';

// Generic PIN gate — used for both the Command Center PIN (owner/supervisor extra lock) and the iPad
// sign-in PIN (everyone's quick app lock). First time (no PIN) it asks them to create one; after that to
// enter it. 3 wrong → 15-min lockout + intruder photo. On success the server sets the unlock cookie and
// the page re-renders. `kind` picks which set of server actions + copy to use.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setCommandCenterPin, unlockCommandCenter, setIpadPin, unlockIpad, reportIntruder } from './account/actions';

// Snap one front-camera frame → data URL. Best-effort: a denied/absent camera resolves to null (the
// server still locks + alerts, just without a photo).
async function snapIntruder() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    const video = document.createElement('video');
    video.srcObject = stream; video.muted = true; await video.play();
    await new Promise((r) => setTimeout(r, 450)); // let the sensor expose
    const c = document.createElement('canvas');
    c.width = video.videoWidth || 480; c.height = video.videoHeight || 640;
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
    stream.getTracks().forEach((t) => t.stop());
    return c.toDataURL('image/jpeg', 0.7);
  } catch (_) { return null; }
}

const pinInput = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', padding: '14px', borderRadius: 10, fontSize: 24, textAlign: 'center', letterSpacing: 10, fontFamily: "'JetBrains Mono',monospace" };

const COPY = {
  cc: {
    icon: '🔒', heading: (t) => t || 'Command Center',
    setSub: 'Set a Command Center PIN — an extra lock on the money / AR view.',
    enterSub: 'Enter your Command Center PIN to open it.',
    openBtn: '🔓 Open Command Center',
    footer: 'A second lock on top of your login. 3 wrong PINs locks it 15 min + photos the device.',
  },
  ipad: {
    icon: '🚐', heading: (t) => t || 'PIN for this iPad',
    setSub: 'Set a quick PIN for faster sign-in on this iPad (you’ll still have your password).',
    enterSub: 'Enter your PIN to unlock the iPad.',
    openBtn: '🔓 Unlock',
    footer: 'Quick lock for this iPad. 3 wrong PINs locks it 15 min + photos whoever’s holding it.',
  },
};

export default function CommandCenterPinGate({ hasPin, title, lockUntil, kind = 'cc' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [err, setErr] = useState('');
  const [locked, setLocked] = useState(lockUntil ? Date.parse(lockUntil) > Date.now() : false);
  const onlyDigits = (v) => v.replace(/\D/g, '').slice(0, 8);
  const c = COPY[kind] || COPY.cc;
  const doSet = kind === 'ipad' ? setIpadPin : setCommandCenterPin;
  const doUnlock = kind === 'ipad' ? unlockIpad : unlockCommandCenter;

  const submit = () => {
    setErr('');
    if (pin.length < 4) { setErr('PIN must be 4–8 digits.'); return; }
    if (!hasPin && pin !== pin2) { setErr('The two PINs don’t match.'); return; }
    start(async () => {
      const r = hasPin ? await doUnlock(pin) : await doSet(pin);
      if (r.ok) { router.refresh(); return; }
      setErr(r.msg || 'Try again.'); setPin(''); setPin2('');
      if (r.locked) setLocked(true);
      if (r.captureIntruder) { const photo = await snapIntruder(); try { await reportIntruder(photo); } catch (_) {} }
    });
  };

  return (
    <div className="wrap" style={{ maxWidth: 380, marginTop: 50 }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 44 }}>{c.icon}</div>
        <div className="h1" style={{ margin: '6px 0 2px' }}>{c.heading(title)}</div>
        <div className="muted" style={{ fontSize: 12.5 }}>{hasPin ? c.enterSub : c.setSub}</div>
      </div>
      {locked ? (
        <div className="card" style={{ borderColor: 'var(--red)', textAlign: 'center' }}>
          <div style={{ fontSize: 32 }}>⛔</div>
          <div style={{ fontWeight: 800, color: 'var(--red)', marginTop: 6 }}>Locked for 15 minutes</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>{err || 'Too many wrong PINs.'} A photo and alert were sent to the owner. A manager can clear the lock.</div>
        </div>
      ) : (
        <div className="card card-amber">
          <input type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(onlyDigits(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter' && hasPin) submit(); }} placeholder="••••" style={pinInput} />
          {!hasPin && (
            <input type="password" inputMode="numeric" value={pin2} onChange={(e) => setPin2(onlyDigits(e.target.value))}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="confirm" style={{ ...pinInput, marginTop: 10, fontSize: 18, letterSpacing: 6 }} />
          )}
          {err && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{err}</div>}
          <button onClick={submit} disabled={pending} className="btn" style={{ width: '100%', marginTop: 14, padding: 14, opacity: pending ? 0.6 : 1 }}>
            {pending ? '…' : hasPin ? c.openBtn : 'Set PIN & continue'}
          </button>
        </div>
      )}
      <div className="muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 12 }}>{c.footer} Re-locks after idle or sign-out.</div>
    </div>
  );
}

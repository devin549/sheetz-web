'use client';

import { useState, useTransition } from 'react';
import { pingLocation } from './actions';
import { MapPin } from 'lucide-react';

// Tech taps this to send a live GPS fix to dispatch (so Hank can route "closest tech" by real distance).
// Uses the browser's geolocation — the phone asks permission the first time.
export default function ShareLocation() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);

  function share() {
    setMsg(null);
    if (!('geolocation' in navigator)) { setMsg({ ok: false, msg: 'This device can’t share location.' }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        start(async () => { const r = await pingLocation(latitude, longitude, accuracy); setMsg(r); });
      },
      (err) => setMsg({ ok: false, msg: err.code === 1 ? 'Location permission denied.' : 'Couldn’t get a fix.' }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 12px' }}>
      <button type="button" onClick={share} disabled={pending} className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, opacity: pending ? 0.6 : 1 }}>
        <MapPin size={15} /> {pending ? 'Sharing…' : 'Share my location'}
      </button>
      {msg && <span style={{ fontSize: 12.5, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
      <span className="muted" style={{ fontSize: 11 }}>helps dispatch route the closest tech for a part/tool</span>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { pingLocation } from './actions';
import { savePrefs } from '../account/actions';
import { MapPin } from 'lucide-react';

// Live location for dispatch ("closest tech" routing). A WEBSITE can't track in the background — browser
// GPS only runs while this page is open and after the tech grants permission. So the model is "accept once":
// the tech turns it on once (saved to their profile via prefs.share_location), and from then on it
// auto-shares whenever My Day is open. `accepted` is that persistent server setting. Stop = pause for this
// session only (it re-arms next visit); fully turning it off lives in Settings. True always-on (app closed /
// phone pocketed) needs a native app or a vehicle GPS.
function metersBetween(aLat, aLng, bLat, bLng) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export default function ShareLocation({ accepted = false }) {
  const [live, setLive] = useState(false);
  const [msg, setMsg] = useState(null);
  const watchRef = useRef(null);
  const lastRef = useRef({ t: 0, lat: null, lng: null });

  // Throttle DB writes: ping at most every 60s, or sooner if the tech moved ~>75m.
  const onPos = useCallback((pos) => {
    const { latitude, longitude, accuracy } = pos.coords;
    const now = Date.now(), last = lastRef.current;
    const movedFar = last.lat == null || metersBetween(last.lat, last.lng, latitude, longitude) > 75;
    if (now - last.t < 60000 && !movedFar) return;
    lastRef.current = { t: now, lat: latitude, lng: longitude };
    pingLocation(latitude, longitude, accuracy).then((r) => setMsg(r && !r.ok ? { ok: false, msg: r.msg } : { ok: true, msg: 'Sharing live' }));
  }, []);

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) { setMsg({ ok: false, msg: 'This device can’t share location.' }); return; }
    if (watchRef.current != null) return;
    watchRef.current = navigator.geolocation.watchPosition(
      onPos,
      (err) => { setMsg({ ok: false, msg: err.code === 1 ? 'Location permission denied.' : 'Couldn’t get a fix.' }); if (err.code === 1) { if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; } setLive(false); } },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
    setLive(true);
  }, [onPos]);

  // Pause for THIS session (doesn't change the saved setting — it re-arms on the next visit).
  const pause = useCallback(() => {
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    setLive(false); setMsg(null);
  }, []);

  // First-time accept (from My Day): save the persistent setting, then start.
  const acceptAndStart = useCallback(() => {
    savePrefs({ share_location: true }).catch(() => {});
    start();
  }, [start]);

  // Already accepted → auto-start whenever the app opens, if permission is still granted (no re-prompt).
  useEffect(() => {
    if (accepted) {
      if (navigator.permissions?.query) {
        navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state !== 'denied') start(); }).catch(() => start());
      } else start();
    }
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); };
  }, [accepted, start]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 12px' }}>
      {live ? (
        <>
          <span className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--green)', borderColor: 'var(--green)', cursor: 'default' }}>
            <MapPin size={15} /> Sharing live ●
          </span>
          <button type="button" onClick={pause} className="btn btn-ghost" style={{ fontSize: 12 }}>Stop</button>
          <span className="muted" style={{ fontSize: 11 }}>auto-updates while My Day is open</span>
        </>
      ) : (
        <>
          <button type="button" onClick={accepted ? start : acceptAndStart} className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <MapPin size={15} /> {accepted ? 'Resume sharing' : 'Share my location'}
          </button>
          {msg && <span style={{ fontSize: 12.5, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
          <span className="muted" style={{ fontSize: 11 }}>{accepted ? 'paused — tap to resume' : 'accept once → dispatch can route you the closest job/part'}</span>
        </>
      )}
    </div>
  );
}

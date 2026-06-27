'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { pingLocation } from './actions';
import { MapPin } from 'lucide-react';

// Live location for dispatch ("closest tech" routing). A WEBSITE can't track in the background — browser
// GPS only runs while this page is open and after the tech grants permission. So: tap once → we watch the
// position and auto-ping while My Day is open (throttled), and re-arm on the next visit if permission's
// already granted. For true always-on (app closed / phone pocketed) you'd need a native app or a vehicle GPS.
const LS_KEY = 'cb_share_loc';

function metersBetween(aLat, aLng, bLat, bLng) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export default function ShareLocation() {
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

  const stop = useCallback(() => {
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    setLive(false); setMsg(null);
    try { localStorage.removeItem(LS_KEY); } catch (_) {}
  }, []);

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) { setMsg({ ok: false, msg: 'This device can’t share location.' }); return; }
    if (watchRef.current != null) return;
    watchRef.current = navigator.geolocation.watchPosition(
      onPos,
      (err) => { setMsg({ ok: false, msg: err.code === 1 ? 'Location permission denied.' : 'Couldn’t get a fix.' }); if (err.code === 1) stop(); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
    setLive(true);
    try { localStorage.setItem(LS_KEY, '1'); } catch (_) {}
  }, [onPos, stop]);

  // Re-arm on load if the tech turned it on before AND permission is still granted (no re-prompt).
  useEffect(() => {
    let on = false;
    try { on = localStorage.getItem(LS_KEY) === '1'; } catch (_) {}
    if (on && navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') start(); }).catch(() => {});
    }
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); };
  }, [start]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 12px' }}>
      <button type="button" onClick={live ? stop : start} className="btn btn-ghost"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: live ? 'var(--green)' : undefined, borderColor: live ? 'var(--green)' : undefined }}>
        <MapPin size={15} /> {live ? 'Sharing live ●' : 'Share my location'}
      </button>
      {live && <button type="button" onClick={stop} className="btn btn-ghost" style={{ fontSize: 12 }}>Stop</button>}
      {msg && <span style={{ fontSize: 12.5, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
      <span className="muted" style={{ fontSize: 11 }}>{live ? 'auto-updates while My Day is open' : 'helps dispatch route the closest tech for a part/tool'}</span>
    </div>
  );
}

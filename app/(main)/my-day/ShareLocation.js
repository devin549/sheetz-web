'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { pingLocation } from './actions';
import { savePrefs } from '../account/actions';

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

export default function ShareLocation({ accepted = false, required = false }) {
  const armed = accepted || required; // field crew: always armed (required, can't opt out in-app)
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

  // Armed (accepted, or required for field crew) → auto-start whenever the app opens, if permission is still
  // granted (no re-prompt). Required crew auto-start even harder (we still try; OS denial surfaces a warning).
  useEffect(() => {
    if (armed) {
      if (navigator.permissions?.query) {
        navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state !== 'denied' || required) start(); }).catch(() => start());
      } else start();
    }
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); };
  }, [armed, required, start]);

  // No visible widget. Location consent is auto-accepted at onboarding (Monitoring Disclosure), so this just
  // runs the background GPS watch silently while My Day is open (when armed). Techs never see a "share my
  // location" prompt; if a tech is dark, the office sees it on the dark-detection view, not here.
  return null;
}

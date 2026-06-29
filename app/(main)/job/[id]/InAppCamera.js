'use client';

// In-app camera — tap a Proof tile and a live viewfinder opens RIGHT HERE (getUserMedia, rear camera).
// Hit the shutter → freeze → Use it (uploads) or Retake. Never opens the Files app. If the camera can't
// start (denied / unsupported / not HTTPS), we fall back to the native capture input so a shot is always
// possible. Image is captured straight to a compressed JPEG blob.
import { useEffect, useRef, useState } from 'react';

export default function InAppCamera({ label, onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [err, setErr] = useState(null);
  const [shot, setShot] = useState(null); // data URL preview after the shutter
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Watchdog: on some iPads getUserMedia resolves but the <video> never paints (stuck on "Starting
    // camera…"). If we're not live within 7s, fall back to the native device camera so a shot is always
    // possible. (Won't override a real 'denied'.)
    const watchdog = setTimeout(() => { if (!cancelled) setErr((e) => e || 'unavailable'); }, 7000);
    (async () => {
      try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Clear the watchdog only once the feed is actually playing (real frames), not just on resolve.
          videoRef.current.onplaying = () => { if (!cancelled) { clearTimeout(watchdog); setReady(true); } };
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (e) { clearTimeout(watchdog); setErr(e?.name === 'NotAllowedError' ? 'denied' : 'unavailable'); }
    })();
    return () => { cancelled = true; clearTimeout(watchdog); if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); };
  }, []);

  const stop = () => { if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); };
  const close = () => { stop(); onClose?.(); };

  const capture = () => {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    const max = 1600; let w = v.videoWidth, h = v.videoHeight;
    if (Math.max(w, h) > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(v, 0, 0, w, h);
    setShot(c.toDataURL('image/jpeg', 0.85));
  };

  const use = async () => {
    try { const blob = await (await fetch(shot)).blob(); stop(); onCapture(new File([blob], 'proof.jpg', { type: 'image/jpeg' })); }
    catch { setErr('unavailable'); }
  };

  // Fallback: native camera capture input (still camera-first on a phone/iPad).
  const onFallbackFile = (e) => { const f = e.target.files?.[0]; if (f) { stop(); onCapture(f); } };

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', color: '#fff' }}>
          <div style={{ fontWeight: 800, fontSize: 16, flex: 1 }}>📷 {label}</div>
          <button onClick={close} style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: 18, padding: '8px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>✕ Close</button>
        </div>

        {err ? (
          <div style={{ background: 'var(--surface-1)', borderRadius: 14, padding: 18, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{err === 'denied' ? 'Camera permission was blocked.' : 'Live camera isn’t available here.'}</div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{err === 'denied' ? 'Allow camera access in your browser, or use the device camera below.' : 'Use the device camera instead — it still opens straight to the camera on an iPad/phone.'}</div>
            <label className="btn" style={{ cursor: 'pointer', display: 'inline-block' }}>
              📷 Open device camera
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFallbackFile} />
            </label>
          </div>
        ) : shot ? (
          <>
            <img src={shot} alt="preview" style={{ width: '100%', borderRadius: 14, maxHeight: '60vh', objectFit: 'contain', background: '#000' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShot(null)} style={{ flex: 1, background: 'var(--surface-2)', color: 'var(--fg-1)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>↺ Retake</button>
              <button onClick={use} className="btn" style={{ flex: 2, padding: 14, fontSize: 15 }}>✓ Use this photo</button>
            </div>
          </>
        ) : (
          <>
            <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 14, maxHeight: '64vh', objectFit: 'cover', background: '#000' }} />
            <button onClick={capture} disabled={!ready} style={{ alignSelf: 'center', width: 74, height: 74, borderRadius: 999, background: '#fff', border: '5px solid rgba(255,255,255,.4)', cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : 0.5 }} aria-label="Take photo" />
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.7)', fontSize: 12 }}>{ready ? 'Tap the shutter' : 'Starting camera…'}</div>
          </>
        )}
      </div>
    </div>
  );
}

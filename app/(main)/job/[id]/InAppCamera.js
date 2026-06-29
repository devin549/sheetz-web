'use client';

// In-app camera — tap a Proof tile and a live viewfinder opens RIGHT HERE (getUserMedia, rear camera).
// Photo mode: shutter → freeze → Use/Retake. Video mode (walkthrough): record → stop → preview → Use/Retake,
// so the walkthrough gets the SAME in-app flow as Before/During/After (no jump to the Files app). If the
// camera can't start (denied/unsupported/not HTTPS) OR the browser can't record video, we fall back to the
// native capture input so a shot is always possible.
import { useEffect, useRef, useState } from 'react';

const VIDEO_MIMES = ['video/mp4', 'video/webm;codecs=vp8', 'video/webm'];
const pickVideoMime = () => {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  return VIDEO_MIMES.find((m) => MediaRecorder.isTypeSupported(m)) || null;
};

export default function InAppCamera({ label, onCapture, onClose, video = false, onPrecheck = null }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const clipBlobRef = useRef(null);
  const [err, setErr] = useState(null);
  const [shot, setShot] = useState(null);       // photo data URL preview after the shutter
  const [clipUrl, setClipUrl] = useState(null); // recorded-video preview URL
  const [recording, setRecording] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(false); // AI clarity pre-check in flight
  const [qa, setQa] = useState(null);              // { verdict:'pass'|'retake', quality, suggestion } | null

  useEffect(() => {
    let cancelled = false;
    // Watchdog: getUserMedia can resolve while the <video> never paints. If we're not live within 7s, fall
    // back to the native device camera. (Won't override a real 'denied'.)
    const watchdog = setTimeout(() => { if (!cancelled) setErr((e) => e || 'unavailable'); }, 7000);
    (async () => {
      try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        // Video mode needs MediaRecorder — if it's not here (older iOS), fall straight to native capture.
        if (video && !pickVideoMime()) throw new Error('unsupported');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: !!video });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onplaying = () => { if (!cancelled) { clearTimeout(watchdog); setReady(true); } };
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (e) { clearTimeout(watchdog); setErr(e?.name === 'NotAllowedError' ? 'denied' : 'unavailable'); }
    })();
    return () => { cancelled = true; clearTimeout(watchdog); stopStream(); if (clipUrl) URL.revokeObjectURL(clipUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopStream = () => { if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop()); };
  const close = () => { try { if (recorderRef.current && recording) recorderRef.current.stop(); } catch (_) {} stopStream(); onClose?.(); };

  // ── Photo ──
  const capture = () => {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    const max = 1600; let w = v.videoWidth, h = v.videoHeight;
    if (Math.max(w, h) > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(v, 0, 0, w, h);
    const url = c.toDataURL('image/jpeg', 0.85);
    setShot(url); setQa(null);
    // AI clarity check (blurry / dark / wrong subject) → nudge a retake before they keep it. Fails soft:
    // if the check is unavailable, no gate (the office still reviews).
    if (onPrecheck) {
      setChecking(true);
      Promise.resolve(onPrecheck(url))
        .then((r) => setQa(r && r.ok && r.review ? r.review : null))
        .catch(() => setQa(null))
        .finally(() => setChecking(false));
    }
  };
  const retakePhoto = () => { setShot(null); setQa(null); setChecking(false); };
  const usePhoto = async () => {
    try {
      const blob = await (await fetch(shot)).blob(); stopStream();
      // If the AI flagged it and they're keeping it anyway, tag the override so the office reviews it.
      const failed = qa && (qa.verdict === 'retake' || qa.quality === 'poor');
      const meta = failed ? { aiFlagged: true, aiReason: qa.suggestion || (qa.quality ? `${qa.quality} quality` : 'flagged by AI') } : null;
      onCapture(new File([blob], 'proof.jpg', { type: 'image/jpeg' }), meta);
    } catch { setErr('unavailable'); }
  };

  // ── Video (walkthrough) ──
  const startRec = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mime = pickVideoMime();
    let rec;
    try { rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined); }
    catch { setErr('unavailable'); return; }
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const type = rec.mimeType || mime || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      clipBlobRef.current = blob;
      setClipUrl(URL.createObjectURL(blob));
    };
    recorderRef.current = rec;
    try { rec.start(); setRecording(true); } catch { setErr('unavailable'); }
  };
  const stopRec = () => { try { recorderRef.current?.stop(); } catch (_) {} setRecording(false); };
  const retake = () => { if (clipUrl) URL.revokeObjectURL(clipUrl); setClipUrl(null); clipBlobRef.current = null; };
  const useVideo = () => {
    const blob = clipBlobRef.current; if (!blob) return;
    const ext = /mp4/.test(blob.type || '') ? 'mp4' : 'webm';
    stopStream();
    onCapture(new File([blob], `walkthrough.${ext}`, { type: blob.type || 'video/webm' }));
  };

  // Fallback: native capture input (still camera-first on a phone/iPad).
  const onFallbackFile = (e) => { const f = e.target.files?.[0]; if (f) { stopStream(); onCapture(f); } };

  const overlayBtn = { background: 'rgba(255,255,255,.15)', color: '#fff', border: 'none', borderRadius: 18, padding: '8px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer' };
  const photoFailed = qa && (qa.verdict === 'retake' || qa.quality === 'poor'); // AI says re-shoot

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', color: '#fff' }}>
          <div style={{ fontWeight: 800, fontSize: 16, flex: 1 }}>{video ? '🎬' : '📷'} {label}</div>
          <button onClick={close} style={overlayBtn}>✕ Close</button>
        </div>

        {err ? (
          <div style={{ background: 'var(--surface-1)', borderRadius: 14, padding: 18, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{err === 'denied' ? 'Camera permission was blocked.' : 'Live camera isn’t available here.'}</div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{err === 'denied' ? 'Allow camera access in your browser, or use the device camera below.' : 'Use the device camera instead — it still opens straight to the camera on an iPad/phone.'}</div>
            <label className="btn" style={{ cursor: 'pointer', display: 'inline-block' }}>
              {video ? '🎬 Open device camera' : '📷 Open device camera'}
              <input type="file" accept={video ? 'video/*' : 'image/*'} capture="environment" style={{ display: 'none' }} onChange={onFallbackFile} />
            </label>
          </div>
        ) : video ? (
          clipUrl ? (
            <>
              <video src={clipUrl} controls playsInline style={{ width: '100%', borderRadius: 14, maxHeight: '74vh', background: '#000' }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={retake} style={{ flex: 1, background: 'var(--surface-2)', color: 'var(--fg-1)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>↺ Retake</button>
                <button onClick={useVideo} className="btn" style={{ flex: 2, padding: 14, fontSize: 15 }}>✓ Use this video</button>
              </div>
            </>
          ) : (
            <>
              <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 14, maxHeight: '78vh', objectFit: 'cover', background: '#000' }} />
              <button onClick={recording ? stopRec : startRec} disabled={!ready} style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: recording ? 'var(--red,#e53935)' : '#fff', color: recording ? '#fff' : '#111', border: '5px solid rgba(255,255,255,.4)', borderRadius: 999, padding: recording ? '0 22px' : 0, width: recording ? 'auto' : 74, height: 74, fontSize: 14, fontWeight: 800, cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : 0.5 }} aria-label={recording ? 'Stop recording' : 'Start recording'}>
                {recording ? '⏹ Stop' : ''}
              </button>
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.7)', fontSize: 12 }}>{ready ? (recording ? '● Recording — tap stop when done' : 'Tap to start recording') : 'Starting camera…'}</div>
            </>
          )
        ) : shot ? (
          <>
            <img src={shot} alt="preview" style={{ width: '100%', borderRadius: 14, maxHeight: '70vh', objectFit: 'contain', background: '#000' }} />
            {checking && <div style={{ textAlign: 'center', color: '#cbb6ff', fontSize: 12.5, fontWeight: 700 }}>✨ Checking the shot…</div>}
            {!checking && photoFailed && <div style={{ background: 'rgba(239,83,80,.16)', border: '1px solid var(--red,#e53935)', borderRadius: 10, padding: '8px 11px', color: '#fff', fontSize: 12.5 }}>⚠ {qa.suggestion || 'This shot looks blurry or unclear'} — retake for a clean one.</div>}
            {!checking && qa && !photoFailed && <div style={{ textAlign: 'center', color: '#a5d6a7', fontSize: 12.5, fontWeight: 700 }}>✓ Looks good{qa.quality ? ` · ${qa.quality}` : ''}</div>}
            {photoFailed ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={retakePhoto} className="btn" style={{ padding: 14, fontSize: 15, background: 'var(--red,#e53935)', borderColor: 'var(--red,#e53935)' }}>↺ Retake</button>
                <button onClick={usePhoto} style={{ background: 'transparent', color: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.25)', borderRadius: 10, padding: 9, fontSize: 12, cursor: 'pointer' }}>Use it anyway</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={retakePhoto} style={{ flex: 1, background: 'var(--surface-2)', color: 'var(--fg-1)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>↺ Retake</button>
                <button onClick={usePhoto} disabled={checking} className="btn" style={{ flex: 2, padding: 14, fontSize: 15, opacity: checking ? 0.6 : 1, cursor: checking ? 'default' : 'pointer' }}>✓ Use this photo</button>
              </div>
            )}
          </>
        ) : (
          <>
            <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 14, maxHeight: '78vh', objectFit: 'cover', background: '#000' }} />
            <button onClick={capture} disabled={!ready} style={{ alignSelf: 'center', width: 74, height: 74, borderRadius: 999, background: '#fff', border: '5px solid rgba(255,255,255,.4)', cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : 0.5 }} aria-label="Take photo" />
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.7)', fontSize: 12 }}>{ready ? 'Tap the shutter' : 'Starting camera…'}</div>
          </>
        )}
      </div>
    </div>
  );
}

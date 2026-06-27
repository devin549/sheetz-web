'use client';

// 📷 Field part scan — scan/type a barcode → resolve the part + the services that use it → tap to add to
// the estimate. Uses the BarcodeDetector camera where the device supports it (iPad/Android), with manual
// entry always available as the fallback.
import { useState, useRef, useEffect } from 'react';

const money = (n) => '$' + (Number(n) || 0).toLocaleString();

export default function BarcodeScan({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const hasDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const lookup = async (c) => {
    const cc = String(c || '').trim(); if (!cc) return;
    setBusy(true); setResult(null);
    try { const r = await fetch('/api/pricebook/barcode/' + encodeURIComponent(cc)); setResult(await r.json()); }
    catch (_) { setResult({ ok: false, error: 'Lookup failed' }); }
    setBusy(false);
  };

  const stopCam = () => { setScanning(false); if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; } };
  const startCam = async () => {
    if (!hasDetector) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream; if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setScanning(true);
      const det = new window.BarcodeDetector();
      const loop = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try { const codes = await det.detect(videoRef.current); if (codes && codes.length) { const c = codes[0].rawValue; stopCam(); setCode(c); lookup(c); return; } } catch (_) {}
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch (_) { setScanning(false); }
  };
  useEffect(() => () => stopCam(), []);

  const inp = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 };

  return (
    <div style={{ marginBottom: 10 }}>
      {!open ? (
        <button onClick={() => setOpen(true)} className="pill" style={{ cursor: 'pointer', color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>📷 Scan a part</button>
      ) : (
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 13 }}>📷 Scan a part</strong>
            <button onClick={() => { stopCam(); setOpen(false); setResult(null); setCode(''); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>

          {scanning && (
            <div style={{ marginTop: 8, position: 'relative' }}>
              <video ref={videoRef} muted playsInline style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, background: '#000' }} />
              <button onClick={stopCam} className="pill" style={{ position: 'absolute', top: 8, right: 8, cursor: 'pointer' }}>Stop</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {hasDetector && !scanning && <button onClick={startCam} className="btn" style={{ fontSize: 13 }}>📷 Use camera</button>}
            <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') lookup(code); }} placeholder="or type / scan UPC" style={{ ...inp, flex: 1, minWidth: 140 }} />
            <button onClick={() => lookup(code)} disabled={busy || !code.trim()} className="btn" style={{ fontSize: 13 }}>{busy ? '…' : 'Look up'}</button>
          </div>
          {!hasDetector && <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>Camera scan isn’t supported on this device — type or paste the barcode.</div>}

          {/* result */}
          {result && !result.ok && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{result.error}</div>}
          {result && result.ok && !result.found && <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>No part on file for <strong>{result.barcode}</strong> — add it as a barcode in the Pricebook Editor.</div>}
          {result && result.ok && result.found && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{result.item?.name || 'Part'}{result.vendor ? <span className="muted" style={{ fontWeight: 400 }}> · {result.vendor}</span> : null}{result.vendorPrice ? <span style={{ color: 'var(--green)' }}> · {money(result.vendorPrice)}</span> : null}</div>
              {result.services?.length > 0 ? (
                <>
                  <div className="muted" style={{ fontSize: 11, margin: '8px 0 5px', textTransform: 'uppercase', letterSpacing: '.05em' }}>Services that use this part — tap to add</div>
                  <div style={{ display: 'grid', gap: 5 }}>
                    {result.services.map((s) => (
                      <button key={s.id} onClick={() => { onAdd && onAdd(s); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-1)' }}>{s.name}</span>
                        <span style={{ fontWeight: 800, color: 'var(--green)' }}>{money(s.price)}</span>
                        <span style={{ color: 'var(--amber)', fontWeight: 800 }}>＋</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>No services linked to this part yet. Confirm its links in the Pricebook Editor.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

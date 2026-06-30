'use client';

// 🚜 Scan a ShareMyToolbox QR tag → check the machine OUT (custody), check it IN, or drop a LOCATE pin.
// Camera QR via BarcodeDetector (iPad/Android) with manual id entry as the fallback. Grabs device GPS
// best-effort so "locate" drops a real pin. Managers can register an unknown tag to a fleet unit.
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { scanTag, registerTag, checkoutUnit, checkinUnit, locateUnit } from './equipmentActions';

const inp = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 };
const timeAgo = (iso) => { if (!iso) return ''; const ms = Date.now() - new Date(iso).getTime(); const d = Math.floor(ms / 864e5); if (d > 0) return `${d}d ago`; const h = Math.floor(ms / 36e5); if (h > 0) return `${h}h ago`; const m = Math.floor(ms / 6e4); return m > 0 ? `${m}m ago` : 'just now'; };

export default function EquipmentScan() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [res, setRes] = useState(null);       // scanTag result
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [site, setSite] = useState('');        // typed location override
  const [gps, setGps] = useState(null);        // {lat,lng}
  const [regTo, setRegTo] = useState('');      // unit id for registration
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const hasDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const grabGps = () => { if (typeof navigator !== 'undefined' && navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 8000 }); };

  const lookup = async (c) => {
    const cc = String(c || '').trim(); if (!cc) return;
    setBusy(true); setMsg(null); setRes(null);
    try { const r = await scanTag(cc); setRes(r); if (r.ok && r.found) grabGps(); }
    catch (_) { setRes({ ok: false, msg: 'Lookup failed.' }); }
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

  const act = async (fn) => {
    if (!res?.unit) return;
    setBusy(true); setMsg(null);
    try { const r = await fn({ unitId: res.unit.id, location: site, lat: gps?.lat, lng: gps?.lng }); setMsg(r); if (r.ok) { const again = await scanTag(code); setRes(again); router.refresh(); } }
    catch (_) { setMsg({ ok: false, msg: 'Action failed.' }); }
    setBusy(false);
  };
  const doRegister = async () => {
    if (!regTo || !code) return;
    setBusy(true); setMsg(null);
    try { const r = await registerTag(regTo, code); setMsg(r); if (r.ok) { const again = await scanTag(code); setRes(again); router.refresh(); } }
    catch (_) { setMsg({ ok: false, msg: 'Register failed.' }); }
    setBusy(false);
  };

  const reset = () => { stopCam(); setOpen(false); setRes(null); setCode(''); setMsg(null); setSite(''); setGps(null); setRegTo(''); };
  const u = res?.unit;

  return (
    <div style={{ marginBottom: 10 }}>
      {!open ? (
        <button onClick={() => setOpen(true)} className="btn" style={{ fontSize: 13 }}>📷 Scan a tag — check out / locate</button>
      ) : (
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 13 }}>🚜 Scan equipment tag</strong>
            <button onClick={reset} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>

          {scanning && (
            <div style={{ marginTop: 8, position: 'relative' }}>
              <video ref={videoRef} muted playsInline style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, background: '#000' }} />
              <button onClick={stopCam} className="pill" style={{ position: 'absolute', top: 8, right: 8, cursor: 'pointer' }}>Stop</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {hasDetector && !scanning && <button onClick={startCam} className="btn" style={{ fontSize: 13 }}>📷 Use camera</button>}
            <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') lookup(code); }} placeholder="or type the tag id (e.g. 148983)" style={{ ...inp, flex: 1, minWidth: 150 }} />
            <button onClick={() => lookup(code)} disabled={busy || !code.trim()} className="btn" style={{ fontSize: 13 }}>{busy ? '…' : 'Look up'}</button>
          </div>
          {!hasDetector && <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>Camera scan isn’t supported here — type the printed tag id.</div>}

          {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{msg.ok ? '✓ ' : ''}{msg.msg}</div>}

          {/* FOUND — show the unit + actions */}
          {res?.ok && res.found && u && (
            <div className="card" style={{ marginTop: 10, background: 'var(--surface-2)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14 }}>{u.unit_label || u.model}</strong>
                <span className="pill" style={{ fontSize: 10, color: u.status === 'out' ? 'var(--red)' : 'var(--green)' }}>{u.status === 'out' ? 'OUT' : 'IN'}</span>
                {u.held_by && <span className="muted" style={{ fontSize: 11 }}>held by {u.held_by}</span>}
              </div>
              {(u.location || u.scanned_at) && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>📍 {u.location || 'no pin yet'}{u.scanned_at ? ` · ${timeAgo(u.scanned_at)}${u.scanned_by ? ' by ' + u.scanned_by : ''}` : ''}</div>}

              <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="where is it? (site / address — optional)" style={{ ...inp, width: '100%', marginTop: 8 }} />
              <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>{gps ? '📡 GPS pin captured — drops an exact location.' : 'Tip: allow location to drop an exact GPS pin.'}</div>

              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {u.status !== 'out' && <button onClick={() => act(checkoutUnit)} disabled={busy} className="btn" style={{ fontSize: 13 }}>✅ Check out to me</button>}
                {u.status === 'out' && <button onClick={() => act(checkinUnit)} disabled={busy} className="btn" style={{ fontSize: 13 }}>↩ Check in</button>}
                <button onClick={() => act(locateUnit)} disabled={busy} className="pill" style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>📍 Update location</button>
              </div>
            </div>
          )}

          {/* NOT FOUND — manager registers it, else a friendly note */}
          {res?.ok && !res.found && (
            res.canManage && res.unregistered?.length ? (
              <div className="card" style={{ marginTop: 10, background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>New tag <span style={{ fontFamily: 'monospace' }}>{code}</span> — attach it to a machine:</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <select value={regTo} onChange={(e) => setRegTo(e.target.value)} style={{ ...inp, flex: 1, minWidth: 160 }}>
                    <option value="">Pick a unit…</option>
                    {res.unregistered.map((un) => <option key={un.id} value={un.id}>{un.unit_label} ({un.model})</option>)}
                  </select>
                  <button onClick={doRegister} disabled={busy || !regTo} className="btn" style={{ fontSize: 13 }}>🏷 Register</button>
                </div>
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Tag <span style={{ fontFamily: 'monospace' }}>{code}</span> isn’t registered yet — ask a manager to attach it to a machine.</div>
            )
          )}
          {res && !res.ok && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{res.msg}</div>}
        </div>
      )}
    </div>
  );
}

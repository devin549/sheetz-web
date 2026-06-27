'use client';

// 📷 Snap the odometer — opens the camera, reads the mileage with AI Vision, and fills it in (no typing).
// Calls onRead(miles) so the parent drops it into its odometer input. Photo is sent once, never stored.
import { useRef, useState } from 'react';
import { scanOdometer } from '@/app/(main)/scanActions';

// Resize a photo to a smallish JPEG data URL so the upload stays light.
function resize(file, maxDim = 1100, quality = 0.82) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      const fr = new FileReader();
      fr.onload = () => {
        img.onload = () => {
          let { width: w, height: h } = img;
          if (Math.max(w, h) > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(null);
        img.src = fr.result;
      };
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(file);
    } catch { resolve(null); }
  });
}

export default function OdometerScan({ onRead, label = 'Snap odometer' }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setMsg(null);
    const dataUrl = await resize(file);
    if (!dataUrl) { setBusy(false); setMsg({ ok: false, t: 'Couldn’t read that photo.' }); return; }
    const r = await scanOdometer(dataUrl);
    setBusy(false);
    if (r.ok) { onRead?.(r.miles); setMsg({ ok: true, t: `Read ${Number(r.miles).toLocaleString()} mi${r.confidence !== 'high' ? ' — double-check it' : ''}` }); }
    else setMsg({ ok: false, t: r.msg || 'Try again.' });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={pick} style={{ display: 'none' }} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, opacity: busy ? 0.6 : 1 }}>
        📷 {busy ? 'Reading…' : label}
      </button>
      {msg && <span style={{ fontSize: 11.5, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.t}</span>}
    </div>
  );
}

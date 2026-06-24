'use client';

import { useState, useTransition } from 'react';
import { Search, Sparkles, Droplets, Camera } from 'lucide-react';
import { decodeWaterHeater, scanDataPlate } from './actions';

// Downscale + normalize any browser-decodable photo (incl. Safari HEIC) to a JPEG data URL —
// smaller payload, consistent format for the vision call.
function fileToJpegDataUrl(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (Math.max(width, height) > maxDim) { const s = maxDim / Math.max(width, height); width = Math.round(width * s); height = Math.round(height * s); }
      const c = document.createElement('canvas'); c.width = width; c.height = height;
      c.getContext('2d').drawImage(img, 0, 0, width, height);
      try { resolve(c.toDataURL('image/jpeg', quality)); } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

const input = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 11px', fontSize: 14, fontFamily: 'inherit' };

function Choice({ q, value, onPick }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {q.opts.map((o) => {
        const on = value === o;
        const danger = (q.danger || []).includes(o);
        const bg = on ? (danger ? 'var(--red)' : 'var(--amber)') : 'var(--surface-2)';
        const fg = on ? (danger ? '#fff' : '#1a1206') : 'var(--fg-2)';
        return (
          <button type="button" key={o} onClick={() => onPick(q.key, on ? '' : o)}
            style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: on ? 800 : 600, padding: '7px 12px', borderRadius: 8, background: bg, color: fg, border: `1px solid ${on ? bg : 'var(--border)'}` }}>
            {danger && '🚨 '}{o}
          </button>
        );
      })}
    </div>
  );
}

export default function BookingTriage({ config }) {
  const [a, setA] = useState({});
  const [pending, start] = useTransition();
  const [scanning, setScanning] = useState(false);
  const [decoded, setDecoded] = useState(null);
  const [decodeMsg, setDecodeMsg] = useState(null);
  const set = (k, v) => setA((p) => ({ ...p, [k]: v }));

  async function onScan(e) {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setDecodeMsg('Please choose a photo.'); return; }
    setDecodeMsg(null); setDecoded(null); setScanning(true);
    let dataUrl;
    try { dataUrl = await fileToJpegDataUrl(file); } catch { setScanning(false); setDecodeMsg('Couldn’t read that image — if it’s an iPhone HEIC, try a screenshot or JPG.'); return; }
    const r = await scanDataPlate(dataUrl);
    setScanning(false);
    if (!r.ok) { setDecodeMsg(r.msg); return; }
    const d = r.data;
    setA((prev) => {
      let next = { ...prev };
      if (d.model) next.model = d.model;
      if (d.serial) next.serial = d.serial;
      return applyDecode(d, next).next;
    });
    setDecoded({ ...d, _applied: [d.fuel && 'fuel', d.capacity_gallons && 'size', d.tank_style && 'height'].filter(Boolean) });
  }

  function applyDecode(d, base) {
    const next = { ...base };
    const applied = [];
    if (d.fuel) { next.fuel = d.fuel; applied.push('fuel'); }
    if (d.capacity_gallons) { next.tank_size = String(d.capacity_gallons); applied.push('size'); }
    if (d.tank_style) { next.tank_style = d.tank_style; applied.push('height'); }
    return { next, applied };
  }
  function runDecode() {
    setDecodeMsg(null); setDecoded(null);
    start(async () => {
      const r = await decodeWaterHeater(a.model || '', a.serial || '');
      if (r.ok) {
        // auto-mark fuel + size + height from the decode (no extra click)
        const { next, applied } = applyDecode(r.data, a);
        setA(next);
        setDecoded({ ...r.data, _applied: applied });
      } else setDecodeMsg(r.msg);
    });
  }

  const danger = config.questions.some((q) => (q.danger || []).includes(a[q.key])) || a.active_leak === 'Yes';

  return (
    <div className="card" style={{ borderLeft: `3px solid ${danger ? 'var(--red)' : 'var(--accent)'}`, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.05em' }}>🧰 Plumbing triage · {config.label}</span>
        {danger && <span className="pill pill-red" style={{ fontSize: 10.5 }}>Emergency</span>}
      </div>

      {/* FloodBusterz upsell */}
      {config.flood && (
        <div style={{ background: 'color-mix(in oklab, var(--accent) 8%, var(--surface-1))', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><Droplets size={14} style={{ color: 'var(--accent)' }} /> {config.flood.title}</div>
          <div className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>{config.flood.body}</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={a[config.flood.flagKey] === 'Yes'} onChange={(e) => set(config.flood.flagKey, e.target.checked ? 'Yes' : '')} />
            {config.flood.flagLabel}
          </label>
        </div>
      )}

      {config.questions.map((q) => (
        <div key={q.key}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 5 }}>{q.label}{q.required && <span style={{ color: 'var(--red)' }}> *</span>}</div>
          {q.type === 'choice' && <Choice q={q} value={a[q.key] || ''} onPick={set} />}
          {q.type === 'text' && <input value={a[q.key] || ''} onChange={(e) => set(q.key, e.target.value)} placeholder={q.placeholder || ''} style={input} autoComplete="off" />}
          {q.type === 'decode' && (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input value={a[q.key] || ''} onChange={(e) => set(q.key, e.target.value)} placeholder={q.placeholder || ''} style={{ ...input, flex: '1 1 180px' }} autoComplete="off" />
                <button type="button" onClick={runDecode} disabled={pending || scanning} className="btn" style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5, opacity: (pending || scanning) ? 0.6 : 1 }}>
                  <Search size={14} /> {pending ? 'Decoding…' : 'Decode'}
                </button>
                <label className="btn" style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: scanning ? 'default' : 'pointer', opacity: scanning ? 0.6 : 1, background: 'var(--surface-2)', color: 'var(--fg-1)', border: '1px solid var(--border)' }}>
                  <Camera size={14} /> {scanning ? 'Reading…' : 'Scan plate'}
                  <input type="file" accept="image/*" capture="environment" onChange={onScan} disabled={scanning} style={{ display: 'none' }} />
                </label>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 5 }}>📷 Snap the rating sticker — we read the model &amp; serial for you. Non-plate photos are rejected automatically.</div>
              {decodeMsg && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6, fontWeight: 700 }}>{decodeMsg}</div>}
              {decoded && (
                <div className="card" style={{ marginTop: 8, padding: '10px 12px', background: 'var(--surface-1)' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}><Sparkles size={12} /> Decoded {decoded.confidence ? `· ${decoded.confidence} confidence` : ''}</div>
                  <div style={{ fontSize: 13 }}>{decoded.summary || 'Unit identified.'}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    {decoded.brand && <span>🏷️ {decoded.brand}</span>}
                    {decoded.capacity_gallons && <span>🛢️ {decoded.capacity_gallons} gal</span>}
                    {decoded.fuel && <span>🔥 {decoded.fuel}</span>}
                    {decoded.vent_type && <span>💨 {decoded.vent_type}</span>}
                    {(decoded.year || decoded.age_years != null) && <span>📅 {decoded.year || ''}{decoded.age_years != null ? ` (${decoded.age_years} yr)` : ''}</span>}
                  </div>
                  {decoded._applied && decoded._applied.length
                    ? <div style={{ marginTop: 8, fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>✓ Auto-marked {decoded._applied.join(' + ')} below — adjust if needed</div>
                    : <div style={{ marginTop: 8, fontSize: 12 }} className="muted">No size/fuel in this decode — set them by hand below.</div>}
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {/* serialized for the parent form */}
      <input type="hidden" name="triage" value={JSON.stringify({ _type: config.id, ...a })} />
    </div>
  );
}

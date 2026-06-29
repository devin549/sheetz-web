'use client';

// ✍️ Finger/stylus/mouse signature pad → PNG data URL. Used on the customer estimate approval (the
// stand-in for text-to-sign until Twilio A2P clears). onChange(dataUrl|null) fires as they sign / clear.
import { useRef, useState } from 'react';

export default function SignaturePad({ onChange, height = 150 }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const ctx = () => { const c = ref.current; return c ? c.getContext('2d') : null; };
  const pos = (e) => {
    const c = ref.current; const r = c.getBoundingClientRect();
    const t = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) };
  };
  const start = (e) => { e.preventDefault(); drawing.current = true; const g = ctx(); if (!g) return; const p = pos(e); g.beginPath(); g.moveTo(p.x, p.y); };
  const move = (e) => {
    if (!drawing.current) return; e.preventDefault();
    const g = ctx(); if (!g) return; const p = pos(e);
    g.lineTo(p.x, p.y); g.strokeStyle = '#111'; g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
    if (!hasInk) setHasInk(true);
  };
  const end = () => { if (!drawing.current) return; drawing.current = false; if (onChange && ref.current && hasInk) onChange(ref.current.toDataURL('image/png')); };
  const clear = () => { const c = ref.current, g = ctx(); if (c && g) g.clearRect(0, 0, c.width, c.height); setHasInk(false); if (onChange) onChange(null); };

  return (
    <div>
      <div style={{ position: 'relative', border: '1px solid #ccc', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
        <canvas ref={ref} width={560} height={height}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          style={{ width: '100%', height, touchAction: 'none', display: 'block' }} />
        {!hasInk && <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#bbb', fontSize: 14, pointerEvents: 'none' }}>✍️ Sign here</span>}
      </div>
      <button type="button" onClick={clear} style={{ marginTop: 6, background: 'none', border: 'none', color: '#9a6a00', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Clear signature</button>
    </div>
  );
}

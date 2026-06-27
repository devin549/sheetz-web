'use client';

// 🔍 Owner-only leak-tracer. Paste/upload a leaked screenshot of the iPad → this boosts contrast around
// the image's mean brightness, pulling the faint tiled watermark (tech name · trace id · date) back into
// view so you can read WHO leaked it. 100% client-side — the image never leaves this browser.
import { useRef, useState, useCallback, useEffect } from 'react';

export default function WatermarkReveal() {
  const srcRef = useRef(null);   // hidden source canvas
  const outRef = useRef(null);   // visible boosted canvas
  const [gain, setGain] = useState(12);
  const [mono, setMono] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [info, setInfo] = useState(null);

  const draw = useCallback(() => {
    const sc = srcRef.current, oc = outRef.current;
    if (!sc || !oc || !sc.width) return;
    const sx = sc.getContext('2d'), ox = oc.getContext('2d');
    oc.width = sc.width; oc.height = sc.height;
    const img = sx.getImageData(0, 0, sc.width, sc.height);
    const d = img.data;
    // mean brightness → reference; amplify each pixel's deviation from it.
    let sum = 0; for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
    const mean = sum / (d.length / 4);
    for (let i = 0; i < d.length; i += 4) {
      if (mono) {
        const g = (d[i] + d[i + 1] + d[i + 2]) / 3;
        const v = Math.max(0, Math.min(255, 128 + (g - mean) * gain));
        d[i] = d[i + 1] = d[i + 2] = v;
      } else {
        for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, 128 + (d[i + c] - mean) * gain));
      }
    }
    ox.putImageData(img, 0, 0);
  }, [gain, mono]);

  useEffect(() => { if (loaded) draw(); }, [loaded, draw]);

  const handleFile = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const sc = srcRef.current;
      // cap to keep it snappy
      const max = 2200, scale = Math.min(1, max / Math.max(im.width, im.height));
      sc.width = Math.round(im.width * scale); sc.height = Math.round(im.height * scale);
      sc.getContext('2d').drawImage(im, 0, 0, sc.width, sc.height);
      setInfo(`${im.width}×${im.height}${scale < 1 ? ` (scaled to ${sc.width}×${sc.height})` : ''}`);
      setLoaded(true);
      URL.revokeObjectURL(url);
    };
    im.src = url;
  };
  const onPaste = (e) => { const it = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/')); if (it) handleFile(it.getAsFile()); };
  useEffect(() => { const h = (e) => onPaste(e); window.addEventListener('paste', h); return () => window.removeEventListener('paste', h); }, []);

  const box = { border: '2px dashed var(--border-strong)', borderRadius: 12, padding: 18, textAlign: 'center' };
  return (
    <div className="wrap" style={{ maxWidth: 980 }}>
      <div className="h1">🔍 Watermark reveal</div>
      <p className="muted" style={{ fontSize: 13 }}>Paste (Ctrl/⌘+V) or upload a leaked screenshot of the iPad. This boosts the faint leak-trace watermark so you can read the tech name + trace id. Stays in your browser — nothing is uploaded.</p>

      <div
        style={box}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
      >
        <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>📋 Paste an image, drag one here, or</div>
        <label className="btn" style={{ cursor: 'pointer' }}>
          Choose image
          <input type="file" accept="image/*" onChange={(e) => handleFile(e.target.files?.[0])} style={{ display: 'none' }} />
        </label>
      </div>

      {loaded && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', margin: '14px 0 8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              Boost <input type="range" min="2" max="40" value={gain} onChange={(e) => setGain(Number(e.target.value))} /> <strong>{gain}×</strong>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} /> grayscale
            </label>
            {info && <span className="muted" style={{ fontSize: 11 }}>{info}</span>}
            <span className="muted" style={{ fontSize: 11 }}>· drag the slider until the tiled text reads clearly</span>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'auto', maxHeight: '70vh', background: '#000' }}>
            <canvas ref={outRef} style={{ display: 'block', width: '100%', height: 'auto' }} />
          </div>
        </>
      )}
      <canvas ref={srcRef} style={{ display: 'none' }} />
    </div>
  );
}

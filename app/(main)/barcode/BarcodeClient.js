'use client';

import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { code39Bars, code39Clean } from '@/lib/code39';

function Barcode({ value }) {
  const { width, height, bars } = useMemo(() => code39Bars(value, { narrow: 2, height: 54 }), [value]);
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ maxWidth: 260 }}>
      <rect x="0" y="0" width={width} height={height} fill="#fff" />
      {bars.map((b, i) => <rect key={i} x={b.x} y="0" width={b.w} height={height} fill="#000" />)}
    </svg>
  );
}

export default function BarcodeClient() {
  const [text, setText] = useState('');
  const labels = text.split('\n').map((l) => l.trim()).filter(Boolean).map(code39Clean).filter(Boolean).slice(0, 200);

  return (
    <>
      <style>{`@media print { body * { visibility: hidden; } #cb-print, #cb-print * { visibility: visible; } #cb-print { position: absolute; left: 0; top: 0; width: 100%; } .cb-noprint { display: none !important; } }`}</style>

      <div className="cb-noprint" style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
          placeholder={'One label per line, e.g.\nA-3\nMOEN-1222\n3/4 PEX ball valve'}
          style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 11px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => window.print()} disabled={!labels.length} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: labels.length ? 1 : 0.6 }}><Printer size={15} /> Print {labels.length || ''} label{labels.length === 1 ? '' : 's'}</button>
          <span className="muted" style={{ fontSize: 12 }}>Code-39 · uppercase + 0-9 - . $ / + %</span>
        </div>
      </div>

      {!labels.length && <div className="card cb-noprint"><span className="muted">Type some lines above to see labels.</span></div>}

      <div id="cb-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {labels.map((l, i) => (
          <div key={i} style={{ border: '1px solid #ddd', borderRadius: 8, padding: '10px 12px', background: '#fff', textAlign: 'center', breakInside: 'avoid' }}>
            <Barcode value={l} />
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.04em', color: '#000', marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>
    </>
  );
}

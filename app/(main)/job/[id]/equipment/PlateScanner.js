'use client';

// 📷 Read a water-heater / appliance data plate with Claude Vision → structured brand/model/fuel/capacity,
// with a fuel-type guard (warns if the read fuel conflicts with the job). The image is downscaled in the
// browser before it goes up, so the call stays fast and cheap. Reading is separate from saving — snapping
// the plate to the equipment registry stays on the existing EquipmentSnap.
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { scanDataPlate } from './visionActions';
import { saveEquipment } from './equipActions';

function fileToScaledDataUrl(file, max = 1100) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(null);
    const fr = new FileReader(); fr.onload = () => { img.src = fr.result; }; fr.readAsDataURL(file);
  });
}

const FUEL_COLOR = { 'NATURAL GAS': '#4f9bff', 'LP / PROPANE': '#ff8a3d', 'ELECTRIC': '#4caf50', 'UNKNOWN': 'var(--fg-3)' };

export default function PlateScanner({ jobType = '', jobId = '' }) {
  const inputRef = useRef();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [plate, setPlate] = useState(null);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(null);

  const save = () => start(async () => {
    const r = await saveEquipment(jobId, plate, jobType);
    setSaved(r.msg);
    if (r.ok) router.refresh();
  });

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setErr(null); setPlate(null);
    start(async () => {
      const url = await fileToScaledDataUrl(f);
      if (!url) { setErr('Could not read that image.'); return; }
      const r = await scanDataPlate(url);
      if (r.ok) setPlate(r.plate); else setErr(r.msg);
    });
    e.target.value = '';
  };

  const jt = String(jobType || '').toLowerCase();
  const expectNat = /natural|nat gas|\bng\b/.test(jt);
  const expectLp = /\blp\b|propane/.test(jt);
  const mismatch = plate && ((expectNat && plate.fuelType === 'LP / PROPANE') || (expectLp && plate.fuelType === 'NATURAL GAS'));

  return (
    <div style={{ marginTop: 10 }}>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
      <button onClick={() => inputRef.current && inputRef.current.click()} disabled={pending}
        style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid var(--purple)', background: 'color-mix(in oklab, var(--purple) 10%, var(--surface-1))', color: 'var(--purple)', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
        {pending ? '✨ Reading the plate…' : '📷 Read data plate (AI)'}
      </button>
      {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{err}</div>}

      {plate && (
        <div className="card" style={{ marginTop: 10, borderLeft: `3px solid ${FUEL_COLOR[plate.fuelType]}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: FUEL_COLOR[plate.fuelType] }}>⛽ {plate.fuelType}</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--purple)', background: 'color-mix(in oklab, var(--purple) 16%, var(--surface-1))', border: '1px solid var(--purple)', padding: '1px 6px', borderRadius: 20 }}>✨ CLAUDE READ</span>
            <span className="pill" style={{ marginLeft: 'auto', fontSize: 10, color: plate.confidence === 'high' ? 'var(--green)' : plate.confidence === 'medium' ? 'var(--amber)' : 'var(--fg-3)' }}>{plate.confidence} confidence</span>
          </div>
          {mismatch && (
            <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(239,83,80,.12)', border: '1px solid var(--red)', fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
              🚨 Fuel mismatch — this plate reads <strong>{plate.fuelType}</strong> but the job looks {expectNat ? 'natural-gas' : 'LP/propane'}. Confirm the unit before you install. Wrong fuel is dangerous.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginTop: 10 }}>
            {[['Brand', plate.brand], ['Model', plate.model], ['Serial', plate.serial], ['Capacity', plate.capacityGallons ? `${plate.capacityGallons} gal` : '—'], ['Year', plate.year || '—']].map(([k, v]) => (
              <div key={k}><div className="muted" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em' }}>{k}</div><div style={{ fontWeight: 700, fontSize: 13, wordBreak: 'break-word' }}>{v || '—'}</div></div>
            ))}
          </div>
          {plate.notes && <div className="muted" style={{ fontSize: 11, marginTop: 8, fontStyle: 'italic' }}>📝 {plate.notes}</div>}
          {!saved ? (
            <button onClick={save} disabled={pending} style={{ width: '100%', marginTop: 10, padding: '10px', borderRadius: 9, border: '1px solid var(--green)', background: 'rgba(76,175,80,.1)', color: 'var(--green)', fontWeight: 800, fontSize: 13, cursor: pending ? 'default' : 'pointer' }}>
              💾 Save to this location’s equipment
            </button>
          ) : <div style={{ fontSize: 12, marginTop: 10, color: 'var(--green)', fontWeight: 700 }}>✓ {saved}</div>}
          <div className="muted" style={{ fontSize: 10.5, marginTop: 8 }}>Saving keeps the model/serial/fuel on file. Snap the plate above to also save the photo.</div>
        </div>
      )}
    </div>
  );
}

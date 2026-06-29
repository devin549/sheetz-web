'use client';

// 📸 Scan a part → match it to OUR book. Snap a photo (in-app camera) → SerpAPI Lens IDs it → we score it
// against the pricebook and show the matching FIXES (our curated items, not vendor prices). Tap the right
// one to drop it on the estimate. Low-confidence shows the top few so the tech picks — never a wrong guess.
import { useState, useTransition } from 'react';
import { identifyPart, learnPartFix } from '@/app/(main)/identify/actions';
import { scanDataPlate } from '../equipment/visionActions';
import InAppCamera from '../InAppCamera';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fileToDataUrl = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });

export default function PartPhotoScan({ onAdd }) {
  const [pending, start] = useTransition();
  const [cam, setCam] = useState(false);
  const [res, setRes] = useState(null);
  const [plate, setPlate] = useState(null);
  const [msg, setMsg] = useState(null);
  const [added, setAdded] = useState({});

  const onPhoto = (file) => {
    setCam(false); setRes(null); setPlate(null); setMsg('🔎 Matching it to your book…');
    start(async () => {
      const fd = new FormData(); fd.set('photo', file);
      let dataUrl = null; try { dataUrl = await fileToDataUrl(file); } catch (_) {}
      // Same shot, two reads: Lens → our-book fix match, AND a data-plate read (brand/model/year). Branded gear
      // (disposals, water heaters) that Lens fumbles still gets ID'd off the plate, and an old unit nudges a
      // replacement quote alongside the repair. Plate read is best-effort — null on a clog with no plate.
      const [r, p] = await Promise.all([
        identifyPart(fd),
        dataUrl ? scanDataPlate(dataUrl).catch(() => null) : Promise.resolve(null),
      ]);
      if (r.ok) { setRes(r); setMsg(null); } else setMsg(r.msg);
      if (p && p.ok && (p.plate?.brand || p.plate?.model)) setPlate(p.plate);
    });
  };
  const pick = (f) => {
    if (onAdd) onAdd({ id: f.id, name: f.name, price: f.price, minimum: f.minimum ?? null });
    setAdded((a) => ({ ...a, [f.id]: true }));
    // Learn-on-correction: the tech confirmed this fix for what the camera saw → the book remembers, so the
    // next scan of the same part (disposals etc.) IDs it instantly. Best-effort; never blocks the add.
    if (res?.guess) learnPartFix(res.guess, f.id).catch(() => {});
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <button onClick={() => setCam(true)} disabled={pending} className="btn" style={{ width: '100%', padding: '11px', fontSize: 13, background: 'var(--surface-2)', color: 'var(--fg-1)', border: '1px solid var(--border-strong)' }}>
        📸 Scan the Pricebook <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>— snap a part, match the book</span>
      </button>
      {msg && <div style={{ fontSize: 12, marginTop: 6, color: msg.startsWith('🔎') ? 'var(--fg-2)' : 'var(--amber)' }}>{msg}</div>}

      {plate && (() => {
        const yr = /^\d{4}$/.test(String(plate.year)) ? Number(plate.year) : null;
        const age = yr ? new Date().getFullYear() - yr : null;
        const spec = [yr, plate.fuelType && plate.fuelType !== 'UNKNOWN' ? plate.fuelType : null, plate.capacityGallons ? `${plate.capacityGallons} gal` : null].filter(Boolean).join(' · ');
        return (
          <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>📋 Data plate</div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{[plate.brand, plate.model].filter(Boolean).join(' · ') || 'Unit'}</div>
            {spec && <div className="muted" style={{ fontSize: 11.5 }}>{spec}</div>}
            {age != null && age >= 10 && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--amber)', fontWeight: 700 }}>⚠ ~{age} yrs old — worth quoting a replacement alongside the repair.</div>
            )}
          </div>
        );
      })()}

      {res && (
        <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          {res.photoUrl && <img src={res.photoUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, float: 'right', marginLeft: 8, background: 'var(--surface-2)' }} />}
          <div style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Looks like</div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{res.guess || 'Not sure — tap the closest'}</div>
          {res.fixes && res.fixes.length > 0 ? (
            <div style={{ clear: 'both', marginTop: 8, display: 'grid', gap: 6 }}>
              <div className="muted" style={{ fontSize: 11 }}>Tap the right fix from your book:</div>
              {res.fixes.map((f) => (
                <button key={f.id} onClick={() => pick(f)} disabled={added[f.id]} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: added[f.id] ? 'color-mix(in oklab, var(--green) 12%, var(--surface-1))' : 'var(--surface-2)', border: '1px solid var(--border)', cursor: added[f.id] ? 'default' : 'pointer', textAlign: 'left' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ fontWeight: 700, color: 'var(--amber)' }}>{money(f.price)}</span>
                  <span className="pill" style={{ fontSize: 10, color: added[f.id] ? 'var(--green)' : 'var(--amber)' }}>{added[f.id] ? '✓ added' : '➕ add'}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="muted" style={{ clear: 'both', fontSize: 12, marginTop: 8 }}>No match in your book — browse the categories or add a custom line.</div>
          )}
          <button onClick={() => setCam(true)} disabled={pending} className="pill" style={{ cursor: 'pointer', marginTop: 8, fontSize: 11 }}>📸 Scan another</button>
        </div>
      )}

      {cam && <InAppCamera label="Scan a part" onCapture={onPhoto} onClose={() => setCam(false)} />}
    </div>
  );
}

'use client';

// ✨ Pre-check a shot before you upload — Claude looks at the photo and says pass / re-shoot with a reason,
// so a tech fixes a bad shot on-site instead of getting bounced by the supervisor later. Advisory only:
// it never blocks the upload (the office QA review is still the gate); it just saves a round trip.
import { useRef, useState, useTransition } from 'react';
import { prescanPhoto } from './visionActions';

function fileToScaledDataUrl(file, max = 1100) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve({ url: c.toDataURL('image/jpeg', 0.8) });
    };
    img.onerror = () => resolve(null);
    const fr = new FileReader(); fr.onload = () => { img.src = fr.result; }; fr.readAsDataURL(file);
  });
}

export default function PhotoQACheck({ jobType = '', requiredKinds = [] }) {
  const inputRef = useRef();
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState(null);
  const [rev, setRev] = useState(null);
  const [err, setErr] = useState(null);

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setErr(null); setRev(null);
    start(async () => {
      const out = await fileToScaledDataUrl(f);
      if (!out) { setErr('Could not read that image.'); return; }
      setPreview(out.url);
      const r = await prescanPhoto(out.url, jobType, requiredKinds);
      if (r.ok) setRev(r.review); else setErr(r.msg);
    });
    e.target.value = '';
  };

  const pass = rev && rev.verdict === 'pass';
  const color = pass ? 'var(--green)' : 'var(--amber)';

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontWeight: 800 }}>✨ Pre-check a shot</span>
        <span className="muted" style={{ fontSize: 11 }}>— catch a bad photo before the office does. Advisory; never blocks your upload.</span>
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
      <button onClick={() => inputRef.current && inputRef.current.click()} disabled={pending}
        style={{ width: '100%', padding: '11px', borderRadius: 10, border: '1px solid var(--purple)', background: 'color-mix(in oklab, var(--purple) 10%, var(--surface-1))', color: 'var(--purple)', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
        {pending ? '✨ Checking your shot…' : '📷 Pre-check a photo'}
      </button>
      {err && <div style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 8 }}>{err}</div>}

      {rev && (
        <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {preview && <img src={preview} alt="" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: `2px solid ${color}`, flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, color, fontSize: 14 }}>{pass ? '✓ Good shot — upload it' : '⚠ Re-shoot this one'}</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>Looks like a <strong style={{ color: 'var(--fg-2)' }}>{rev.detectedKind}</strong> photo · {rev.quality} quality{rev.showsWork ? '' : ' · doesn’t clearly show the work'}</div>
            {rev.issues.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--fg-2)' }}>{rev.issues.map((s, i) => <li key={i}>{s}</li>)}</ul>}
            {rev.suggestion && <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, color: pass ? 'var(--green)' : 'var(--amber)' }}>💡 {rev.suggestion}</div>}
            <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>Then upload the good shot below — this check doesn’t save anything.</div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

// 🪪 Scan a driver's license with Claude Vision to put identity on file. Reads ONLY name/expiry/state and
// checks the name against this tech's profile — so AI/office can confirm the device belongs to them. The
// image is downscaled in-browser; only name/expiry/state are stored (never the license number or DOB).
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { scanLicense } from './actions';

function fileToScaledDataUrl(file, max = 1300) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(null);
    const fr = new FileReader(); fr.onload = () => { img.src = fr.result; }; fr.readAsDataURL(file);
  });
}

export default function LicenseScanner({ onFile: _ignored }) {
  const router = useRouter();
  const inputRef = useRef();
  const [pending, start] = useTransition();
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);

  const pick = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setErr(null); setRes(null);
    start(async () => {
      const url = await fileToScaledDataUrl(f);
      if (!url) { setErr('Could not read that image.'); return; }
      const r = await scanLicense(url);
      if (r.ok) { setRes(r); router.refresh(); } else setErr(r.msg);
    });
    e.target.value = '';
  };

  return (
    <span>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={pick} style={{ display: 'none' }} />
      <button onClick={() => inputRef.current && inputRef.current.click()} disabled={pending}
        style={{ fontSize: 12, fontWeight: 700, color: 'var(--purple)', background: 'color-mix(in oklab, var(--purple) 10%, var(--surface-2))', border: '1px solid var(--purple)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap', opacity: pending ? 0.6 : 1 }}>
        {pending ? '✨ Reading…' : '📷 Scan License (AI)'}
      </button>
      {err && <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 6 }}>{err}</div>}
      {res && (
        <div style={{ fontSize: 11.5, marginTop: 6, color: res.matches ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>
          {res.matches ? '✓' : '⚠'} {res.license.name}{res.license.state ? ` · ${res.license.state}` : ''}{res.license.expiry ? ` · exp ${res.license.expiry}` : ''}{res.matches ? ' — matches your profile' : ' — name doesn’t match your profile, office will review'}
        </div>
      )}
    </span>
  );
}

'use client';

// 🧾 Scan a parts receipt on the Parts/PO tab — tapping it opens the CAMERA (live viewfinder, same as the
// proof tiles), Claude Vision reads vendor + total, flags a known vendor, and one tap fills the job's
// material cost. Read → review → "Use" (the tech confirms; nothing auto-saves off a blurry read). A small
// "upload a saved photo" fallback covers the rare no-camera case.
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { scanReceipt, setJobCosts, flagFieldSubcontractor } from './actions';
import InAppCamera from './InAppCamera';

function fileToScaledDataUrl(file, max = 1400) {
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
const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function ScanReceipt({ jobId, dispatchCents = 0 }) {
  const uploadRef = useRef();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [camOpen, setCamOpen] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const [savedMsg, setSavedMsg] = useState(null);
  const [lastUrl, setLastUrl] = useState(null);   // the scanned image, kept so "Confirm sub" can persist it
  const [subName, setSubName] = useState('');
  const [subMsg, setSubMsg] = useState(null);

  // Shared: take a File (from the camera or an upload), scale it, read it.
  const scan = (file) => {
    setErr(null); setRes(null); setSavedMsg(null); setSubMsg(null); setSubName('');
    start(async () => {
      const url = await fileToScaledDataUrl(file);
      if (!url) { setErr('Could not read that image.'); return; }
      setLastUrl(url);
      const r = await scanReceipt(jobId, url);
      if (r.ok) setRes(r); else setErr(r.msg);
    });
  };
  // 🧱 Confirm this scan is a subcontractor's bill → persist it + route to accounting (held from pay).
  const confirmSub = () => start(async () => { setSubMsg(null); const r = await flagFieldSubcontractor(jobId, lastUrl, { vendor: res.vendor, total: res.total, subName }); setSubMsg(r); if (r.ok) router.refresh(); });
  const onUpload = (e) => { const f = e.target.files?.[0]; if (f) scan(f); e.target.value = ''; };

  // "Use" → set the material cost to the scanned total (keep the existing dispatch fee untouched).
  const use = () => start(async () => {
    const r = await setJobCosts(jobId, Number(res.total) || 0, (Number(dispatchCents) || 0) / 100);
    setSavedMsg(r.ok ? `✓ Material cost set to ${money(res.total)} from ${res.vendor || 'receipt'}.` : r.msg);
    if (r.ok) router.refresh();
  });

  return (
    <div className="card" style={{ marginTop: 10, borderLeft: '3px solid var(--purple, #9c64f4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>🧾</span>
        <div style={{ fontWeight: 800 }}>Scan a receipt <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— camera reads the vendor + cost</span></div>
      </div>
      <button onClick={() => setCamOpen(true)} disabled={pending}
        style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid var(--purple, #9c64f4)', background: 'color-mix(in oklab, var(--purple, #9c64f4) 10%, var(--surface-1))', color: 'var(--purple, #9c64f4)', fontWeight: 800, fontSize: 13, cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1 }}>
        {pending ? '✨ Reading the receipt…' : '📷 Scan receipt (opens camera)'}
      </button>
      <div style={{ marginTop: 6 }}>
        <button type="button" onClick={() => uploadRef.current?.click()} className="muted" style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontSize: 11 }}>or upload a saved photo</button>
        <input ref={uploadRef} type="file" accept="image/*" onChange={onUpload} style={{ display: 'none' }} />
      </div>
      {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{err}</div>}

      {camOpen && <InAppCamera label="Receipt" onClose={() => setCamOpen(false)} onCapture={(file) => { setCamOpen(false); scan(file); }} />}

      {res && (
        <div className="card" style={{ marginTop: 10, background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{res.vendor || 'Unknown vendor'}</span>
            <span className="pill" style={{ fontSize: 9.5, fontWeight: 800, color: res.knownVendor ? 'var(--green)' : 'var(--amber)', border: '1px solid ' + (res.knownVendor ? 'var(--green)' : 'var(--amber)') }}>{res.knownVendor ? '✓ Known vendor' : '＋ New vendor'}</span>
            <span className="pill" style={{ marginLeft: 'auto', fontSize: 9.5, color: 'var(--purple, #9c64f4)' }}>✨ {res.confidence} confidence</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 8, marginTop: 10 }}>
            {[['Total', money(res.total)], ['Date', res.date || '—'], ['Line items', res.items || '—']].map(([k, v]) => (
              <div key={k}><div className="muted" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em' }}>{k}</div><div style={{ fontWeight: 700, fontSize: 13 }}>{v}</div></div>
            ))}
          </div>
          {res.notes && <div className="muted" style={{ fontSize: 11, marginTop: 6, fontStyle: 'italic' }}>📝 {res.notes}</div>}
          {!savedMsg ? (
            <button onClick={use} disabled={pending || !(Number(res.total) > 0)} className="btn btn-primary" style={{ width: '100%', marginTop: 10, opacity: (pending || !(Number(res.total) > 0)) ? 0.6 : 1 }}>
              💵 Use {money(res.total)} as the material cost
            </button>
          ) : <div style={{ fontSize: 12, marginTop: 10, color: 'var(--green)', fontWeight: 700 }}>{savedMsg}</div>}
          <div className="muted" style={{ fontSize: 10.5, marginTop: 8 }}>Review the read before you use it. This sets your material cost — it never auto-saves a blurry scan.</div>

          {/* 🧱 Not a parts receipt? Flag it as a subcontractor's bill → accounting verifies before pay. */}
          <div style={{ borderTop: '1px dashed var(--border)', marginTop: 10, paddingTop: 8 }}>
            {res.isSubcontractor && <div style={{ fontSize: 11.5, color: 'var(--amber)', marginBottom: 5 }}>🤖 This looks like a subcontractor’s bill, not a parts receipt.</div>}
            {!subMsg?.ok ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <input value={subName} onChange={(ev) => setSubName(ev.target.value)} placeholder="Subcontractor name (optional)" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
                <button onClick={confirmSub} disabled={pending || !lastUrl} className="pill" style={{ cursor: 'pointer', color: 'var(--amber)', border: `1px solid ${res.isSubcontractor ? 'var(--amber)' : 'var(--border-strong)'}`, fontWeight: 700, justifyContent: 'center', display: 'flex' }}>🧱 Confirm subcontractor — send to accounting</button>
                {subMsg && !subMsg.ok && <div style={{ color: 'var(--red)', fontSize: 11.5 }}>{subMsg.msg}</div>}
              </div>
            ) : <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>✓ {subMsg.msg} Held until accounting verifies.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

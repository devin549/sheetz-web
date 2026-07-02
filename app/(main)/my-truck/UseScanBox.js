'use client';

// 🔫 SCAN-TO-USE — Devin's picture, verbatim: tech pulls material off the van, zaps the barcode, it
// auto-adds to the ticket (with cost) and the van count drops; low stock flags on the spot. Built for a
// Bluetooth HID scanner (it "types" the code + Enter into the box), fingers work too. Keeps a running
// session tally like a register receipt.
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { scanUseFromVan } from './truckActions';

export default function UseScanBox({ jobId, jobNumber = '' }) {
  const router = useRouter();
  const inputRef = useRef();
  const [pending, start] = useTransition();
  const [code, setCode] = useState('');
  const [log, setLog] = useState([]); // newest first: { ok, msg }
  if (!jobId) return null;

  const zap = () => {
    const v = code.trim();
    if (v.length < 2 || pending) return;
    setCode('');
    start(async () => {
      const r = await scanUseFromVan(v, jobId);
      setLog((l) => [{ ok: !!r.ok, msg: r.msg || (r.ok ? 'Added.' : 'Miss.') }, ...l].slice(0, 12));
      if (r.ok) router.refresh();
      // keep focus so the next trigger-pull lands here without a tap
      try { inputRef.current && inputRef.current.focus(); } catch (_) {}
    });
  };

  const used = log.filter((l) => l.ok).length;

  return (
    <div className="card" style={{ marginTop: 10, borderLeft: '3px solid var(--green)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontWeight: 800 }}>🔫 Scan parts onto this ticket</span>
        <span className="muted" style={{ fontSize: 11 }}>{jobNumber ? `job #${jobNumber}` : ''}</span>
        {used > 0 && <span className="pill" style={{ marginLeft: 'auto', color: 'var(--green)', fontWeight: 800 }}>{used} added</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input ref={inputRef} value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') zap(); }}
          inputMode="text" autoComplete="off" placeholder="Scan a barcode (or type the part) — Enter adds it"
          style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 9, padding: '11px 12px', fontSize: 14 }} />
        <button onClick={zap} disabled={pending || code.trim().length < 2} className="btn" style={{ opacity: (pending || code.trim().length < 2) ? 0.55 : 1 }}>{pending ? '…' : '➖ Use'}</button>
      </div>
      <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>Each scan takes 1 off your van and bills it onto the job with its cost. Pair a Bluetooth scanner (HID mode) and it types right in here.</div>
      {log.length > 0 && (
        <div style={{ marginTop: 8, display: 'grid', gap: 3 }}>
          {log.map((l, i) => <div key={i} style={{ fontSize: 12, fontWeight: 700, color: l.ok ? 'var(--green)' : 'var(--red)' }}>{l.msg}</div>)}
        </div>
      )}
    </div>
  );
}

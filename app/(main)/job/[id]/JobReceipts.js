'use client';

// 🧾 Every receipt scanned on THIS job, visible to the tech — they add up (the multi-receipt fix made the
// math right; this makes it VISIBLE). A guy can hit Lowe's 15 times on one job — each run is listed, counted
// per vendor, and totaled, with a gentle gas nudge when the trips stack up. Each row has a Material ↔ Sub
// toggle (the scan-time AI guess isn't always right); flipping re-sums the job's material cost server-side.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setReceiptSub } from './actions';

const money = (c) => '$' + ((Number(c) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function JobReceipts({ jobId, entries = [] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  if (!entries.length) return null;

  const mats = entries.filter((e) => !e.isSub);
  const subs = entries.filter((e) => e.isSub);
  const matTotal = mats.reduce((s, e) => s + (Number(e.amountCents) || 0), 0);
  const subTotal = subs.reduce((s, e) => s + (Number(e.amountCents) || 0), 0);

  // Trips per vendor (material runs) — "Lowe's ×15 · $612" chips + the gas nudge when runs stack up.
  const byVendor = {};
  mats.forEach((e) => { const v = (e.vendor || 'Store').trim() || 'Store'; (byVendor[v] = byVendor[v] || { n: 0, cents: 0 }); byVendor[v].n++; byVendor[v].cents += Number(e.amountCents) || 0; });
  const vendorChips = Object.entries(byVendor).sort((a, b) => b[1].n - a[1].n);
  const runs = mats.length;

  const flip = (e) => {
    setMsg(null); setBusy(e.photoId);
    start(async () => { const r = await setReceiptSub(jobId, e.photoId, !e.isSub); setMsg(r); setBusy(null); if (r?.ok) router.refresh(); });
  };

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontWeight: 800 }}>🧾 Receipts on this job</span>
        <span className="pill" style={{ marginLeft: 'auto', color: 'var(--green)', fontWeight: 800 }}>Materials {money(matTotal)} · ×{runs}</span>
        {subTotal > 0 && <span className="pill" style={{ color: 'var(--amber)', fontWeight: 700 }}>Subs {money(subTotal)} · ×{subs.length}</span>}
      </div>

      {vendorChips.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {vendorChips.map(([v, s]) => <span key={v} className="pill" style={{ fontSize: 11.5 }}>{v} ×{s.n} · {money(s.cents)}</span>)}
        </div>
      )}

      {runs >= 4 && (
        <div style={{ marginBottom: 8, padding: '8px 11px', borderRadius: 9, fontSize: 12, fontWeight: 700, color: 'var(--fg-1)', background: 'rgba(255,179,0,0.14)', border: '1px solid var(--amber-dim)' }}>
          🚗 {runs} store runs on this job — it happens, but every run burns gas + windshield time. Check the shop / load the van fuller next time.
        </div>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        {entries.map((e) => (
          <div key={e.photoId} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderTop: '1px solid var(--border)' }}>
            {e.thumbUrl
              ? <a href={e.thumbUrl} target="_blank" rel="noreferrer"><img src={e.thumbUrl} alt="receipt" style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--border)' }} /></a>
              : <span style={{ width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: 'var(--surface-2)', fontSize: 16 }}>🧾</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.vendor || 'Receipt'}{e.isSub && e.subName ? <span className="muted"> · {e.subName}</span> : null}</div>
              <div className="muted" style={{ fontSize: 10.5 }}>{e.when || ''}{e.isSub ? ' · sub — accounting verifies before payment' : ''}</div>
            </div>
            <span style={{ fontFamily: 'var(--mono, monospace)', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{money(e.amountCents)}</span>
            <button onClick={() => flip(e)} disabled={pending} title={e.isSub ? 'Tap to count as MATERIAL' : 'Tap if this is a SUBCONTRACTOR bill'}
              style={{ flexShrink: 0, padding: '5px 9px', borderRadius: 8, fontSize: 10.5, fontWeight: 800, cursor: 'pointer', border: `1px solid ${e.isSub ? 'var(--amber)' : 'var(--border-strong)'}`, background: e.isSub ? 'rgba(255,179,0,0.16)' : 'var(--surface-2)', color: e.isSub ? 'var(--amber)' : 'var(--fg-2)', opacity: busy === e.photoId ? 0.5 : 1 }}>
              {busy === e.photoId ? '…' : e.isSub ? '🧱 Sub' : '🧾 Material'}
            </button>
          </div>
        ))}
      </div>
      {msg && <div style={{ fontSize: 12, marginTop: 7, fontWeight: 700, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
      <div className="muted" style={{ fontSize: 10.5, marginTop: 7 }}>Materials add into the job’s material cost (feeds pay). Tap the pill if a bill is really a subcontractor — it moves to accounting instead.</div>
    </div>
  );
}

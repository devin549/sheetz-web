'use client';

// 🔦 Scan / type a part → find it NEAREST (your van · the shops · other techs' vans · vendors) ranked by
// drive time, with route + reserve. Ports the gold My Truck scan box (cbInv_compare) but hands off to our
// upgrade — the Google-Maps inventory locator at /tools (resolveInventory ranks every source by ETA).
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TruckScan({ big = false }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const go = (e) => { e.preventDefault(); const v = q.trim(); if (v) router.push(`/tools?q=${encodeURIComponent(v)}`); };
  return (
    <form onSubmit={go} className="card" style={{ padding: big ? 16 : '12px 14px', borderLeft: '3px solid var(--amber)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: big ? 24 : 18 }}>🔦</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: big ? 15 : 13 }}>Scan or find a part</div>
          <div className="muted" style={{ fontSize: 11.5 }}>Where is it — your van, the shop, another tech, a vendor? Nearest first + drive time + route.</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus={big}
          inputMode="search" placeholder="scan a barcode or type sku / name — e.g. wax ring, 1/2 PEX elbow"
          style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '11px 12px', fontSize: 14, color: 'var(--fg-1)' }} />
        <button type="submit" className="btn" style={{ whiteSpace: 'nowrap' }}>Find →</button>
      </div>
    </form>
  );
}

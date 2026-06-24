import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function StockMap() {
  await requireHref('/stock-map');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Stock Map</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const res = await sb.from('shop_stock').select('item, sku, qty, bin, min_qty').order('bin').limit(2000);
  if (res.error && /could not find|does not exist|schema cache/i.test(res.error.message || '')) {
    return (
      <div className="wrap" style={{ maxWidth: 940 }}>
        <div className="h1">Stock Map</div>
        <p className="muted">What lives in each bin.</p>
        <div className="notice">Needs its table — run <code>supabase/49_shop_stock.sql</code> in Supabase, then slot items on <Link href="/slotting">Slotting</Link>.</div>
      </div>
    );
  }
  const rows = res.data || [];
  const bins = {};
  rows.forEach((r) => { const b = r.bin || '__none'; (bins[b] = bins[b] || []).push(r); });
  const binKeys = Object.keys(bins).filter((b) => b !== '__none').sort();
  const unslotted = bins.__none || [];

  return (
    <div className="wrap" style={{ maxWidth: 940 }}>
      <div className="h1">Stock Map</div>
      <p className="muted">What lives in each bin. {binKeys.length} bins · {rows.length} items{unslotted.length ? ` · ${unslotted.length} unslotted` : ''}.</p>

      {!rows.length && <div className="card"><span className="muted">No shop stock yet — add items on <Link href="/slotting">Slotting &amp; Putaway</Link>.</span></div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
        {binKeys.map((b) => (
          <div key={b} className="card" style={{ padding: '11px 13px' }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 6 }}>📍 {b} <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>· {bins[b].length}</span></div>
            <div style={{ marginTop: 6, display: 'grid', gap: 3 }}>
              {bins[b].map((r, i) => {
                const low = r.min_qty != null && Number(r.qty) <= Number(r.min_qty);
                return <div key={i} style={{ fontSize: 12.5, display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{r.item}</span><span className="muted" style={{ color: low ? 'var(--red)' : 'var(--fg-3)', whiteSpace: 'nowrap' }}>{r.qty}{low ? ' ⚠' : ''}</span></div>;
              })}
            </div>
          </div>
        ))}
      </div>

      {unslotted.length > 0 && (
        <>
          <h3 style={{ margin: '20px 0 8px', fontSize: 12, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Unslotted ({unslotted.length}) — assign on <Link href="/slotting">Slotting</Link></h3>
          <div className="card"><span className="muted" style={{ fontSize: 12.5 }}>{unslotted.map((r) => r.item).join(' · ')}</span></div>
        </>
      )}
    </div>
  );
}

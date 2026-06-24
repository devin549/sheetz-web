import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import ShopCounter from './ShopCounter';

export const dynamic = 'force-dynamic';

function money(n) { return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function reorderPoint(p) { return p.reorder_point != null ? Number(p.reorder_point) : 3; }
function isLow(p) { return Number(p.qty || 0) <= reorderPoint(p); }
function deficit(p) { return Math.max(0, reorderPoint(p) - Number(p.qty || 0)); }

function Section({ title, children }) {
  return (<>
    <h3 style={{ margin: '22px 0 8px', fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</h3>
    {children}
  </>);
}

export default async function Shop() {
  await requireHref('/shop');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">🏪 Shop</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to read inventory.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const { data: stock, error } = await sb.from('truck_inventory').select('tech_name, name, sku, qty, reorder_point, unit, bin');
  if (error && /relation .* does not exist/i.test(error.message)) {
    return <div className="wrap"><div className="h1">🏪 Shop</div><div className="notice">Run <code>supabase/05_truck_tools.sql</code> in Supabase, then refresh.</div></div>;
  }
  const rows = stock || [];
  const low = rows.filter(isLow);

  // Shop Counter — recent issues/rentals to jobs (graceful if 46 not run yet).
  let issues = [];
  const iss = await sb.from('shop_issues').select('id, job_id, item_name, sku, qty, unit, total_cost_cents, kind, status, created_at').order('created_at', { ascending: false }).limit(40);
  if (!iss.error) issues = iss.data || [];
  const itemNames = [...new Set(rows.map((p) => p.name).filter(Boolean))].slice(0, 200);

  // PURCHASING VIEW — consolidate low parts across all vans into one reorder list.
  const byPart = {};
  low.forEach((p) => {
    const key = (p.sku || p.name || 'unknown').toString().toLowerCase();
    const r = byPart[key] = byPart[key] || { name: p.name || p.sku, sku: p.sku, unit: p.unit || 'ea', order: 0, vans: 0 };
    r.order += deficit(p) || 1;
    r.vans += 1;
  });
  const purchaseList = Object.values(byPart).sort((a, b) => b.order - a.order);

  // RESTOCK-RUN VIEW — which truck needs what (pack a run per van).
  const byTruck = {};
  low.forEach((p) => { (byTruck[p.tech_name || 'Unassigned'] = byTruck[p.tech_name || 'Unassigned'] || []).push(p); });
  const trucks = Object.keys(byTruck).sort((a, b) => byTruck[b].length - byTruck[a].length);

  return (
    <div className="wrap">
      <div className="h1">🏪 Shop</div>
      <p className="muted">Reorder &amp; restock from one place. Low-stock rolls up here from every van.</p>

      <Section title="🛒 Shop counter — issue to a job">
        <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>Parts, materials, and rentals issued to a JOB# — the cost hits the <strong>job</strong>, not tech pay.</p>
        <ShopCounter recent={issues} items={itemNames} />
      </Section>

      <div className="card card-amber" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 8 }}>
        <div><div style={{ fontSize: 24, fontWeight: 800, color: low.length ? '#ff8a65' : 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>{low.length > 0 && <span className="alert-dot amber" aria-hidden="true" />}{low.length}</div><div className="muted" style={{ fontSize: 11 }}>low line-items</div></div>
        <div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--amber)' }}>{purchaseList.length}</div><div className="muted" style={{ fontSize: 11 }}>parts to reorder</div></div>
        <div><div style={{ fontSize: 24, fontWeight: 800 }}>{trucks.length}</div><div className="muted" style={{ fontSize: 11 }}>trucks need a run</div></div>
        <div><div style={{ fontSize: 24, fontWeight: 800 }}>{rows.length}</div><div className="muted" style={{ fontSize: 11 }}>total line-items</div></div>
      </div>

      <Section title="🧾 Reorder list (purchasing)">
        {!purchaseList.length && <div className="card"><span className="muted">Nothing low — every van is stocked. 🎉</span></div>}
        {purchaseList.length > 0 && (
          <div className="card" style={{ padding: 0 }}>
            {purchaseList.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '11px 14px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{r.name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{r.sku ? r.sku + ' · ' : ''}low on {r.vans} van{r.vans > 1 ? 's' : ''}</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--amber)', whiteSpace: 'nowrap' }}>order ~{r.order} {r.unit}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="🚐 Restock runs (by truck)">
        {!trucks.length && <div className="card"><span className="muted">No restock runs needed.</span></div>}
        {trucks.map((t) => (
          <div key={t} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>{t}</span>
              <Link href={`/my-truck?tech=${encodeURIComponent(t)}`} className="muted" style={{ fontSize: 12 }}>full truck →</Link>
            </div>
            <div className="meta" style={{ marginTop: 6, color: '#ff8a65' }}>
              {byTruck[t].map((p) => `${p.name || p.sku} (${Number(p.qty || 0)}${p.unit ? ' ' + p.unit : ''})`).join(' · ')}
            </div>
          </div>
        ))}
      </Section>

      <Section title="📦 Self-issue review">
        <div className="card"><span className="muted">After-hours self-pull approvals (Reed&apos;s review queue) port here next — costs hit the Job#, not tech pay.</span></div>
      </Section>
    </div>
  );
}

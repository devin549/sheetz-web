import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireRole } from '@/lib/guard';

export const dynamic = 'force-dynamic';

function money(n) { return '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function isLow(p) {
  const rp = p.reorder_point != null ? Number(p.reorder_point) : 3;
  return Number(p.qty || 0) <= rp;
}
function Section({ title, children }) {
  return (<>
    <h3 style={{ margin: '20px 0 8px', fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</h3>
    {children}
  </>);
}

export default async function MyTruck({ searchParams }) {
  const { user, role } = await requireRole(['owner', 'tech']);
  const myName = (user.user_metadata && user.user_metadata.name) || '';
  const techParam = (searchParams && searchParams.tech ? String(searchParams.tech) : '').trim();
  // a tech only ever sees their own truck; an owner sees the fleet, or one tech via ?tech=
  const detailTech = role === 'tech' ? myName : techParam;

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">🚐 My Truck</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to read truck data.</div></div>;
  }
  const sb = getSupabaseAdmin();

  // ── FLEET OVERVIEW (owner, no specific tech) — break down by tech ──────────
  if (!detailTech) {
    const [{ data: allParts }, { data: allTools }] = await Promise.all([
      sb.from('truck_inventory').select('tech_name, name, qty, reorder_point'),
      sb.from('tools').select('assigned_to, value'),
    ]);
    const byTech = {};
    const get = (t) => (byTech[t] = byTech[t] || { parts: 0, low: 0, lowItems: [], tools: 0, value: 0 });
    (allParts || []).forEach((p) => { const r = get(p.tech_name || 'Unassigned'); r.parts++; if (isLow(p)) { r.low++; if (r.lowItems.length < 4) r.lowItems.push(p.name); } });
    (allTools || []).forEach((t) => { const r = get(t.assigned_to || 'Unassigned'); r.tools++; r.value += Number(t.value) || 0; });
    const techs = Object.keys(byTech).sort((a, b) => byTech[b].low - byTech[a].low);

    return (
      <div className="wrap">
        <div className="h1">🚐 Trucks · the fleet</div>
        <p className="muted">Each tech&apos;s van + tools. Sorted by who&apos;s most low on stock. Tap a tech to see their full truck.</p>
        {!techs.length && <div className="card"><span className="muted">No truck data yet — stock a van to see it here.</span></div>}
        {techs.map((t) => {
          const r = byTech[t];
          return (
            <Link key={t} href={`/my-truck?tech=${encodeURIComponent(t)}`} className="card card-amber" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 15 }}>{t}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {r.parts} parts · <span style={{ color: r.low ? '#ff8a65' : 'var(--green)' }}>{r.low} low</span> · {r.tools} tools · {money(r.value)} →
                </span>
              </div>
              {r.lowItems.length > 0 && (
                <div className="meta" style={{ marginTop: 6, color: '#ff8a65' }}>
                  ⚠ needs restock: {r.lowItems.join(', ')}{r.low > r.lowItems.length ? ` +${r.low - r.lowItems.length} more` : ''}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    );
  }

  // ── ONE TRUCK DETAIL (a tech's own, or owner drilled into a tech) ─────────
  const [{ data: inv, error: invErr }, { data: tools }] = await Promise.all([
    sb.from('truck_inventory').select('*').ilike('tech_name', detailTech).order('name'),
    sb.from('tools').select('*').ilike('assigned_to', detailTech).order('name'),
  ]);
  if (invErr && /relation .* does not exist/i.test(invErr.message)) {
    return <div className="wrap"><div className="h1">🚐 My Truck</div><div className="notice">Run <code>supabase/05_truck_tools.sql</code> in Supabase, then refresh.</div></div>;
  }
  const parts = inv || [];
  const lowCount = parts.filter(isLow).length;
  const toolList = tools || [];
  const toolVal = toolList.reduce((a, t) => a + (Number(t.value) || 0), 0);

  return (
    <div className="wrap">
      <div className="h1">🚐 {role === 'tech' ? 'My Truck' : detailTech + '’s Truck'}</div>
      <p className="muted">{role === 'owner' ? <Link href="/my-truck">← back to the fleet</Link> : 'Your van parts + tools issued to you.'}</p>

      <div className="card card-amber" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--amber)' }}>{parts.length}</div><div className="muted" style={{ fontSize: 11 }}>parts on van</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: lowCount ? '#ff8a65' : 'var(--green)' }}>{lowCount}</div><div className="muted" style={{ fontSize: 11 }}>low stock</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800 }}>{toolList.length}</div><div className="muted" style={{ fontSize: 11 }}>tools issued</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green-bright)' }}>{money(toolVal)}</div><div className="muted" style={{ fontSize: 11 }}>tools value</div></div>
      </div>

      <Section title="🧰 Parts on the van">
        {!parts.length && <div className="card"><span className="muted">No parts stocked yet.</span></div>}
        {parts.length > 0 && (
          <div className="card" style={{ padding: 0 }}>
            {parts.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13 }}>{p.name || p.sku}{p.bin ? <span className="muted" style={{ fontSize: 11 }}> · {p.bin}</span> : ''}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: isLow(p) ? '#ff8a65' : 'var(--fg-2)', whiteSpace: 'nowrap' }}>{Number(p.qty || 0)} {p.unit || 'ea'}{isLow(p) ? ' ⚠' : ''}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="🔧 Tools issued">
        {!toolList.length && <div className="card"><span className="muted">No tools issued yet.</span></div>}
        {toolList.length > 0 && (
          <div className="card" style={{ padding: 0 }}>
            {toolList.map((t) => {
              const loaned = /loan/i.test(String(t.status || ''));
              return (
                <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '11px 14px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</div>
                    <div className="muted" style={{ fontSize: 10, fontFamily: 'monospace' }}>{[t.serial && 'SN: ' + t.serial, t.mfg, t.year, t.value && money(t.value)].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: loaned ? '#ff8a65' : 'var(--green-bright)', whiteSpace: 'nowrap' }}>{loaned ? '🔄 LOANED' : '✓ ON VAN'}</span>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

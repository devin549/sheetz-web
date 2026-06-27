import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireRole } from '@/lib/guard';
import { can } from '@/lib/roles';
import { canSeeCost } from '@/lib/pricebookEngine';
import Maintenance from './Maintenance';
import TruckScan from './TruckScan';
import IdentifyClient from '../identify/IdentifyClient';
import AddTool from '../tools/AddTool';
import ToolRemoveBtn from './ToolRemoveBtn';

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
  // Field crew see their OWN truck; owner/manager/shop see the fleet. (Was requireHref, which checks the
  // office nav and silently bounced techs even though My Truck is in their rail.)
  const { user, role, profile } = await requireRole(['owner', 'admin', 'gm', 'om', 'tech', 'helper', 'foreman', 'fs', 'shop', 'dispatcher']);
  const myName = (profile && profile.name) || (user.user_metadata && user.user_metadata.name) || '';
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
                  {r.parts} parts · <span style={{ color: r.low ? 'var(--red)' : 'var(--green)' }}>{r.low} low</span> · {r.tools} tools · {money(r.value)} →
                </span>
              </div>
              {r.lowItems.length > 0 && (
                <div className="meta" style={{ marginTop: 6, color: 'var(--red)' }}>
                  <span className="alert-dot amber" aria-hidden="true" />needs restock: {r.lowItems.join(', ')}{r.low > r.lowItems.length ? ` +${r.low - r.lowItems.length} more` : ''}
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

  // 🔧 Maintenance (HTML van pane) — oil tracker / health / docs / service log. Fail-soft pre-96.
  let maint = {}, serviceLog = [], oil = { known: false }, health = {};
  try { const { data } = await sb.from('van_maintenance').select('*').ilike('tech_name', detailTech).maybeSingle(); maint = data || {}; } catch (_) {}
  try { const { data } = await sb.from('van_service_log').select('id, service_date, item, vendor, cost_cents, mileage').ilike('tech_name', detailTech).order('service_date', { ascending: false }).limit(20); serviceLog = data || []; } catch (_) {}
  { const { oilStatus, vanHealth } = await import('@/lib/vanHealth');
    oil = oilStatus(maint);
    const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    const repair12mo = serviceLog.filter((s) => s.service_date >= yearAgo).reduce((a, s) => a + (Number(s.cost_cents) || 0), 0);
    health = vanHealth({ repair12moCents: repair12mo, year: maint.year }); }

  // 🏪 Shop Inventory (HTML My Truck sub-tab) — what the shops have, read-only for the tech. Fail-soft pre-89.
  let shopStock = {};
  try {
    const { data } = await sb.from('item_locations').select('name, sku, qty, bin, location_id').eq('location_type', 'shop').gt('qty', 0).order('name').limit(300);
    (data || []).forEach((p) => { const k = p.location_id || 'shop'; (shopStock[k] = shopStock[k] || []).push(p); });
  } catch (_) {}
  const shopLabel = (k) => ({ richmond: 'Richmond', lexington: 'Lexington' }[k] || (k.charAt(0).toUpperCase() + k.slice(1)));

  // 🚐 My Truck sub-tabs (gold pane-tools: My Van · Truck-Wide Search · Shop Inventory · My Tools · Maintenance).
  const sub = ['search', 'shop', 'tools', 'maint', 'id'].includes(searchParams?.sub) ? searchParams.sub : 'van';
  const techQ = role === 'tech' ? '' : `tech=${encodeURIComponent(detailTech)}&`;
  const subHref = (s) => `/my-truck?${techQ}sub=${s}`;
  const lowParts = parts.filter(isLow);
  const SUBS = [['van', '🚐 My Van'], ['search', '🔦 Find a Part'], ['shop', '🏪 Shop'], ['tools', '🔧 My Tools'], ['id', '🔍 ID Part'], ['maint', '🛠 Maintenance']];

  // 🔍 ID Part sub-tab needs the tech's active job (so a found fix drops onto it) + whether they see cost.
  let activeJob = null;
  if (profile?.tech_id) {
    try { const { data } = await sb.from('jobs').select('id, job_number').eq('tech_id', profile.tech_id).in('status', ['enroute', 'on_site', 'onsite', 'rolling']).order('scheduled_at', { ascending: true }).limit(1).maybeSingle(); activeJob = data || null; } catch (_) {}
  }
  const showCost = canSeeCost(role);
  // Add / remove tools = manager-controlled (Chris W / Ronnie / owner), per the shop-sheet tool design.
  const canManageTools = can(role, 'manageInventory') || can(role, 'manageUsers');

  return (
    <div className="wrap" style={{ maxWidth: 880 }}>
      <div className="h1">🚐 {role === 'tech' ? 'My Truck' : detailTech + '’s Truck'}</div>
      <p className="muted">{role === 'owner' ? <Link href="/my-truck">← back to the fleet</Link> : 'Your van parts, tools & the shops — nearest part is one tap away.'}</p>

      {/* sub-tab strip */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', overflowX: 'auto', margin: '4px 0 14px' }}>
        {SUBS.map(([s, label]) => (
          <Link key={s} href={subHref(s)} className="pill" style={{ textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: sub === s ? 800 : 600, background: sub === s ? 'var(--amber)' : 'var(--surface-2)', color: sub === s ? '#1a1206' : 'var(--fg-2)', border: '1px solid var(--border)' }}>
            {label}{s === 'van' && lowCount ? <span style={{ marginLeft: 5, color: sub === s ? '#7a1a1a' : 'var(--red)', fontWeight: 800 }}>{lowCount}⚠</span> : null}
          </Link>
        ))}
      </div>

      {/* ───────── MY VAN ───────── */}
      {sub === 'van' && (<>
        <div className="card card-amber" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--amber)' }}>{parts.length}</div><div className="muted" style={{ fontSize: 10.5 }}>parts on van</div></div>
          <div><div style={{ fontSize: 22, fontWeight: 800, color: lowCount ? 'var(--red)' : 'var(--green)' }}>{lowCount}</div><div className="muted" style={{ fontSize: 10.5 }}>low stock</div></div>
          <div><div style={{ fontSize: 22, fontWeight: 800 }}>{toolList.length}</div><div className="muted" style={{ fontSize: 10.5 }}>tools issued</div></div>
          <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green-bright)' }}>{money(toolVal)}</div><div className="muted" style={{ fontSize: 10.5 }}>tools value</div></div>
        </div>

        <div style={{ marginTop: 10 }}><TruckScan /></div>

        {lowParts.length > 0 && (
          <div className="card" style={{ marginTop: 10, borderLeft: '3px solid var(--red)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span className="alert-dot amber" aria-hidden="true" />
              <strong style={{ fontSize: 13, color: 'var(--red)' }}>Low stock — {lowParts.length} to restock</strong>
              <Link href={subHref('shop')} className="pill" style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>🏪 Restock →</Link>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>{lowParts.slice(0, 8).map((p) => p.name || p.sku).join(', ')}{lowParts.length > 8 ? ` +${lowParts.length - 8} more` : ''}</div>
          </div>
        )}

        <Section title="🧰 Parts on the van">
          {!parts.length && <div className="card"><span className="muted">No parts stocked yet.</span></div>}
          {parts.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              {parts.map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13 }}>{isLow(p) && <span className="alert-dot amber" aria-hidden="true" />}{p.name || p.sku}{p.bin ? <span className="muted" style={{ fontSize: 11 }}> · {p.bin}</span> : ''}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isLow(p) ? 'var(--red)' : 'var(--fg-2)', whiteSpace: 'nowrap' }}>{Number(p.qty || 0)} {p.unit || 'ea'}{isLow(p) ? ' ⚠' : ''}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </>)}

      {/* ───────── FIND A PART (Google-Maps nearest locator) ───────── */}
      {sub === 'search' && (<>
        <TruckScan big />
        <Link href="/tools" className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit', marginTop: 10, borderLeft: '3px solid var(--amber)' }}>
          <span style={{ fontSize: 26 }}>🗺️</span>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 800 }}>Open the full locator</div><div className="muted" style={{ fontSize: 12 }}>Map of every van, shop &amp; vendor — ranked by drive time, with route + reserve.</div></div>
          <span style={{ color: 'var(--amber)', fontWeight: 800 }}>›</span>
        </Link>
      </>)}

      {/* ───────── SHOP INVENTORY ───────── */}
      {sub === 'shop' && (
        Object.keys(shopStock).length === 0
          ? <div className="card"><span className="muted">No shop stock loaded yet. Use 🔦 Find a Part to search every source.</span></div>
          : <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <h3 style={{ fontSize: 13, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.05em', margin: 0, flex: 1 }}>🏪 Shop Inventory</h3>
              <Link href={subHref('search')} className="pill" style={{ fontSize: 10.5, color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>🔦 Find nearest →</Link>
            </div>
            {Object.entries(shopStock).map(([loc, items]) => (
              <div key={loc} className="card" style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>📍 {shopLabel(loc)} shop · {items.length} part{items.length === 1 ? '' : 's'}</div>
                <div style={{ display: 'grid', gap: 3 }}>
                  {items.slice(0, 40).map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '4px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ flex: 1, minWidth: 0 }}>{p.name}{p.bin ? <span className="muted" style={{ fontSize: 11 }}> · bin {p.bin}</span> : ''}</span>
                      <span style={{ fontWeight: 700 }}>{Number(p.qty) || 0}</span>
                    </div>
                  ))}
                  {items.length > 40 && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>+{items.length - 40} more — use 🔦 Find a Part.</div>}
                </div>
              </div>
            ))}
          </>
      )}

      {/* ───────── MY TOOLS (custody) ───────── */}
      {sub === 'tools' && (<>
        <Link href="/tools" className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit', borderLeft: '3px solid var(--amber)' }}>
          <span style={{ fontSize: 24 }}>🔧</span>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 800 }}>Find / loan a tool</div><div className="muted" style={{ fontSize: 12 }}>Every van, shop &amp; vendor — nearest first, route + reserve.</div></div>
          <span style={{ color: 'var(--amber)', fontWeight: 800 }}>›</span>
        </Link>
        {/* Manager-controlled: add a tool to the roster (issue) — per the shop-sheet tool design. */}
        {canManageTools && <div style={{ marginTop: 10 }}><AddTool /></div>}

        <Section title={`🔧 Tools issued to ${role === 'tech' ? 'you' : detailTech} · ${money(toolVal)}`}>
          {!toolList.length && <div className="card"><span className="muted">No tools issued yet{canManageTools ? ' — use ＋ Add a tool above.' : '.'}</span></div>}
          {toolList.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              {toolList.map((t) => {
                const loaned = /loan/i.test(String(t.status || ''));
                const photo = t.condition_photo_url || null;
                return (
                  <div key={t.id} style={{ display: 'grid', gridTemplateColumns: `${photo ? '38px ' : ''}1fr auto${canManageTools ? ' auto' : ''}`, gap: 10, padding: '11px 14px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                    {photo && <img src={photo} alt="" title="Condition photo on file" style={{ width: 38, height: 38, borderRadius: 5, objectFit: 'cover', border: '1px solid var(--border)' }} />}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</div>
                      <div className="muted" style={{ fontSize: 10, fontFamily: 'monospace' }}>{[t.serial && 'SN: ' + t.serial, t.mfg, t.year, t.value && money(t.value)].filter(Boolean).join(' · ')}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: loaned ? 'var(--red)' : 'var(--green-bright)', whiteSpace: 'nowrap' }}>{loaned ? '🔄 LOANED' : '✓ ON VAN'}</span>
                    {canManageTools && <ToolRemoveBtn toolId={t.id} toolName={t.name} />}
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </>)}

      {/* ───────── 🔍 ID PART (SerpAPI Lens part identifier — moved into the Truck tab per Devin) ───────── */}
      {sub === 'id' && (
        <div style={{ marginTop: 4 }}>
          <IdentifyClient activeJobId={activeJob?.id || null} activeJobNumber={activeJob?.job_number || null} showCost={showCost} />
        </div>
      )}

      {/* ───────── MAINTENANCE ───────── */}
      {sub === 'maint' && <Maintenance maint={maint} serviceLog={serviceLog} oil={oil} health={health} tech={role === 'tech' ? '' : detailTech} />}
    </div>
  );
}

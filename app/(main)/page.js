import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { roleOf, canSee } from '@/lib/nav';
import { can, roleMeta } from '@/lib/roles';

export const dynamic = 'force-dynamic';

function money(n) {
  const v = Number(n || 0);
  if (v >= 1000) return '$' + Math.round(v / 1000) + 'k';
  return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function isLow(p) {
  const rp = p.reorder_point != null ? Number(p.reorder_point) : 3;
  return Number(p.qty || 0) <= rp;
}
const isField = (r) => ['owner', 'admin', 'tech', 'foreman', 'fs'].includes(r);

// Live numbers for the home strip. Server-side (service_role) — RLS-safe.
async function loadKpis() {
  if (!isAdminConfigured) return null;
  const sb = getSupabaseAdmin();
  const [custCount, invRows, jobRows, invStock, toolRows] = await Promise.all([
    sb.from('customers').select('*', { count: 'exact', head: true }).then((r) => r.count || 0).catch(() => 0),
    (async () => {
      let total = 0, count = 0, from = 0;
      while (true) {
        const { data } = await sb.from('invoices').select('balance').eq('status', 'open').range(from, from + 999);
        if (!data || !data.length) break;
        data.forEach((d) => { total += Number(d.balance) || 0; });
        count += data.length;
        if (data.length < 1000) break;
        from += 1000;
      }
      return { total, count };
    })().catch(() => ({ total: 0, count: 0 })),
    sb.from('jobs').select('status, priority').then((r) => r.data || []).catch(() => []),
    sb.from('truck_inventory').select('tech_name, qty, reorder_point').then((r) => r.data || []).catch(() => []),
    sb.from('tools').select('value').then((r) => r.data || []).catch(() => []),
  ]);
  const openJobs = jobRows.filter((j) => /scheduled|on_site/i.test(String(j.status || ''))).length;
  const urgent = jobRows.filter((j) => /high|urgent|emergency/i.test(String(j.priority || ''))).length;
  const trucks = new Set(invStock.map((p) => p.tech_name || 'Unassigned')).size;
  const lowStock = invStock.filter(isLow).length;
  const toolVal = toolRows.reduce((a, t) => a + (Number(t.value) || 0), 0);
  return { customers: custCount, ar: invRows.total, openInv: invRows.count, openJobs, urgent, trucks, lowStock, toolVal };
}

function Kpi({ value, label, href, color, blink }) {
  const inner = (
    <div className="card card-amber" style={{ minWidth: 0 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--amber)', display: 'flex', alignItems: 'center', gap: 6 }}>
        {blink && <span className="alert-dot" aria-hidden="true" />}{value}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link> : inner;
}

// Owner Sheet section map — each tile gated by the SAME permission model. Built ones link
// (canSee → reuses the nav rule); the rest show "porting →" so every role sees its real map.
function commandTiles(role) {
  return [
    { icon: '💰', label: 'Money & AR', sub: 'past-due, collections', href: '/past-due', show: (r) => canSee('/past-due', r) },
    { icon: '📋', label: 'Jobs / My Day', sub: 'today’s board, status', href: '/my-day', show: (r) => canSee('/my-day', r) },
    { icon: '👥', label: 'Customers', sub: '13k base, CB numbers', href: '/customers', show: (r) => canSee('/customers', r) },
    { icon: '🚐', label: 'Fleet & Trucks', sub: 'van stock, tools', href: '/my-truck', show: (r) => canSee('/my-truck', r) },
    { icon: '🏪', label: 'Shop', sub: 'reorder, restock runs', href: '/shop', show: (r) => canSee('/shop', r) },
    { icon: '📲', label: 'Booking / Dispatch', sub: 'book + live board', soon: true, show: (r) => can(r, 'createJobs') || can(r, 'assignJobs') || can(r, 'seeQueue') },
    { icon: '📈', label: 'Marketing & Intel', sub: 'rank, reviews, leads', soon: true, show: (r) => r === 'marketing' || r === 'gm' || r === 'owner' || r === 'admin' },
    { icon: '🛡️', label: 'Warranty (Pete)', sub: 'claim pipeline', soon: true, show: (r) => can(r, 'contactCustomer') && can(r, 'seeAllJobs') },
    { icon: '📞', label: 'Call Intelligence', sub: 'listen, summarize', soon: true, show: (r) => can(r, 'manageUsers') },
    { icon: '🧾', label: 'Accounting / Receipts', sub: 'OCR + classify', soon: true, show: (r) => can(r, 'seeFinancials') },
    { icon: '💸', label: 'Payroll', sub: 'closed-job pay → gate', soon: true, show: (r) => can(r, 'seeFinancials') },
    { icon: '⭐', label: 'Reviews & Reputation', sub: 'watcher + heat', soon: true, show: (r) => can(r, 'seeReports') },
    { icon: '🧑‍✈️', label: 'Team & Roster', sub: 'add hires, set roles', href: '/team', show: (r) => can(r, 'manageUsers') },
    { icon: '🩺', label: 'System Health', sub: 'self-audit + alerts', soon: true, show: (r) => r === 'owner' || r === 'admin' },
  ].filter((t) => t.show(role));
}

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = roleOf(user);
  const meta = roleMeta(role);
  const fullName = (user && user.user_metadata && user.user_metadata.name) || (user && user.email) || '';
  const first = String(fullName).split(/[\s@]/)[0] || 'there';

  // Show the KPI strip if the role can see anything on it; load once, gate each tile.
  const wantsKpis = can(role, 'seeFinancials') || can(role, 'seeAllJobs') || isField(role) || role === 'shop';
  const kpis = wantsKpis ? await loadKpis() : null;
  const tiles = commandTiles(role);

  const title = (role === 'owner' || role === 'admin') ? 'Owner Command Center'
    : (isField(role) || role === 'helper') ? 'My Field Day'
      : role === 'shop' ? 'Shop'
        : `${meta.label} · Command Center`;

  // Each KPI gated by the permission it represents.
  const kpiDefs = kpis ? [
    { show: can(role, 'seeFinancials'), el: <Kpi key="ar" value={money(kpis.ar)} label="AR outstanding" href="/past-due" /> },
    { show: can(role, 'seeFinancials'), el: <Kpi key="inv" value={kpis.openInv.toLocaleString()} label="open invoices" href="/past-due" /> },
    { show: canSee('/my-day', role), el: <Kpi key="jobs" value={kpis.openJobs} label="open jobs" href="/my-day" /> },
    { show: canSee('/my-day', role), el: <Kpi key="urg" value={kpis.urgent} label="urgent" href="/my-day" color={kpis.urgent ? 'var(--red)' : 'var(--green)'} blink={kpis.urgent > 0} /> },
    { show: canSee('/customers', role), el: <Kpi key="cust" value={kpis.customers.toLocaleString()} label="customers" href="/customers" /> },
    { show: canSee('/my-truck', role), el: <Kpi key="trk" value={kpis.trucks} label="trucks" href="/my-truck" /> },
    { show: canSee('/shop', role) || isField(role), el: <Kpi key="low" value={kpis.lowStock} label="low stock" href={canSee('/shop', role) ? '/shop' : '/my-truck'} color={kpis.lowStock ? '#ff8a65' : 'var(--green)'} blink={kpis.lowStock > 0} /> },
    { show: canSee('/my-truck', role), el: <Kpi key="tv" value={money(kpis.toolVal)} label="tools on vans" href="/my-truck" color="var(--green-bright)" /> },
  ].filter((k) => k.show) : [];

  return (
    <div className="wrap">
      <div className="h1">{title}</div>
      <p className="muted">
        Welcome back, {first}. Signed in as{' '}
        <strong style={{ color: meta.color }}>{meta.label}</strong>{' '}
        <span className="muted">· {meta.short}</span>.
        {kpiDefs.length ? ' Live snapshot:' : ' Pick a screen to get rolling:'}
      </p>

      {kpiDefs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, margin: '14px 0' }}>
          {kpiDefs.map((k) => k.el)}
        </div>
      )}
      {wantsKpis && !kpis && (
        <div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel and the live numbers fill in here.</div>
      )}

      <h3 style={{ margin: '22px 0 8px', fontSize: 12, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Command center
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 10 }}>
        {tiles.map((t) => {
          const body = (
            <>
              <div style={{ fontSize: 22 }}>{t.icon}</div>
              <div style={{ fontWeight: 800, fontSize: 14, marginTop: 4 }}>{t.label}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{t.sub}</div>
              {t.soon
                ? <div style={{ marginTop: 7 }}><span className="pill" style={{ color: 'var(--amber-dim)' }}>porting →</span></div>
                : <div style={{ marginTop: 7 }}><span className="pill pill-green">live ✓</span></div>}
            </>
          );
          return t.href
            ? <Link key={t.label} href={t.href} className="card card-amber" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{body}</Link>
            : <div key={t.label} className="card" style={{ opacity: 0.82 }}>{body}</div>;
        })}
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        Tiles are gated by your role’s real permissions (ported from the live board).
        <strong> live ✓</strong> reads real data; <strong>porting →</strong> is next
        (see <code>docs/API_INTEGRATIONS_BY_ROLE.md</code>).
      </p>
    </div>
  );
}

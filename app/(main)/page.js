import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { roleOf } from '@/lib/nav';

export const dynamic = 'force-dynamic';

const ROLE_LABEL = { owner: 'Owner', office: 'Office', tech: 'Tech' };

function money(n) {
  const v = Number(n || 0);
  if (v >= 1000) return '$' + Math.round(v / 1000) + 'k';
  return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function isLow(p) {
  const rp = p.reorder_point != null ? Number(p.reorder_point) : 3;
  return Number(p.qty || 0) <= rp;
}

// Pull the live numbers the owner/office home shows. Server-side (service_role) — RLS-safe.
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

  return {
    customers: custCount,
    ar: invRows.total, openInv: invRows.count,
    openJobs, urgent, trucks, lowStock, toolVal,
  };
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

// The Owner Sheet section map — every area has a home so nothing gets "rediscovered".
// `href` = built & live. `soon` = ported next (links to the role-API checklist meanwhile).
function commandTiles(role) {
  const all = [
    { icon: '💰', label: 'Money & AR', sub: 'past-due, collections cascade', href: '/past-due', roles: ['owner', 'office'] },
    { icon: '📋', label: 'Jobs / My Day', sub: 'today’s board, live status', href: '/my-day', roles: ['owner', 'office', 'tech'] },
    { icon: '👥', label: 'Customers', sub: '13k ST base, CB numbers', href: '/customers', roles: ['owner', 'office'] },
    { icon: '🚐', label: 'Fleet & Trucks', sub: 'van stock, tools, restock', href: '/my-truck', roles: ['owner', 'tech'] },
    { icon: '🏪', label: 'Shop', sub: 'reorder list, restock runs', href: '/shop', roles: ['owner', 'shop'] },
    { icon: '📲', label: 'Booking / Dispatch', sub: 'CSR booking + live board', soon: true, roles: ['owner', 'office'] },
    { icon: '📈', label: 'Marketing & Intel', sub: 'SerpAPI rank, review tracker', soon: true, roles: ['owner'] },
    { icon: '🛡️', label: 'Warranty (Pete)', sub: '16-provider claim pipeline', soon: true, roles: ['owner', 'office'] },
    { icon: '📞', label: 'Call Intelligence', sub: 'listen, summarize, redact', soon: true, roles: ['owner'] },
    { icon: '🧾', label: 'Accounting / Receipts', sub: 'OCR + classify + match', soon: true, roles: ['owner', 'office'] },
    { icon: '💸', label: 'Payroll', sub: 'closed-job pay → approval gate', soon: true, roles: ['owner', 'office'] },
    { icon: '⭐', label: 'Reviews & Reputation', sub: 'watcher + heat detector', soon: true, roles: ['owner'] },
    { icon: '🧑‍✈️', label: 'Team & Roster', sub: 'supervisors, crews, scorecards', soon: true, roles: ['owner'] },
    { icon: '🩺', label: 'System Health', sub: 'self-audit + LSA alerts', soon: true, roles: ['owner'] },
  ];
  return all.filter((t) => t.roles.includes(role));
}

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = roleOf(user);
  const fullName = (user && user.user_metadata && user.user_metadata.name) || (user && user.email) || '';
  const first = String(fullName).split(/[\s@]/)[0] || 'there';

  const showKpis = role === 'owner' || role === 'office';
  const kpis = showKpis ? await loadKpis() : null;
  const tiles = commandTiles(role);

  const title = role === 'owner' ? 'Owner Command Center'
    : role === 'office' ? 'Office Command Center'
      : role === 'shop' ? 'Shop'
        : 'My Field Day';

  return (
    <div className="wrap">
      <div className="h1">{title}</div>
      <p className="muted">
        Welcome back, {first}. Signed in as <strong style={{ color: 'var(--amber)' }}>{ROLE_LABEL[role] || role}</strong>.
        {showKpis ? ' Live snapshot from Supabase:' : ' Pick a screen to get rolling:'}
      </p>

      {showKpis && kpis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, margin: '14px 0' }}>
          <Kpi value={money(kpis.ar)} label="AR outstanding" href="/past-due" />
          <Kpi value={kpis.openInv.toLocaleString()} label="open invoices" href="/past-due" />
          <Kpi value={kpis.openJobs} label="open jobs" href="/my-day" />
          <Kpi value={kpis.urgent} label="urgent" href="/my-day" color={kpis.urgent ? 'var(--red)' : 'var(--green)'} blink={kpis.urgent > 0} />
          <Kpi value={kpis.customers.toLocaleString()} label="customers" href="/customers" />
          <Kpi value={kpis.trucks} label="trucks" href="/my-truck" />
          <Kpi value={kpis.lowStock} label="low stock" href="/shop" color={kpis.lowStock ? '#ff8a65' : 'var(--green)'} blink={kpis.lowStock > 0} />
          <Kpi value={money(kpis.toolVal)} label="tools on vans" href="/my-truck" color="var(--green-bright)" />
        </div>
      )}

      {showKpis && !kpis && (
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
        Every tile maps to an Owner Sheet area. <strong>Live ✓</strong> is ported and reading real data;
        <strong> porting →</strong> is next on the list (see <code>docs/API_INTEGRATIONS_BY_ROLE.md</code>).
      </p>
    </div>
  );
}

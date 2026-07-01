import { requirePerm } from '@/lib/guard';
import { isAdminConfigured, getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { openRecs, declinedEstimates, agingWaterHeaters, loadMarkers, OPP_KINDS, canWorkOpportunities } from '@/lib/opportunities';
import OppBoard from './OppBoard';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesScreen() {
  const { role } = await requirePerm('contactCustomer', 'seeReports', 'assignJobs', 'manageUsers');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">🎯 Opportunities</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();
  const year = new Date().getFullYear();

  // Pull the three streams + the status markers in parallel.
  const [recs, declined, aging, markers] = await Promise.all([
    openRecs(sb), declinedEstimates(sb), agingWaterHeaters(sb, year), loadMarkers(sb),
  ]);

  // Live-source rows drop off once a marker says won/dismissed/sent; native recs already carry their status.
  const isClosed = (ref) => { const m = markers.get(ref); return m && ['won', 'dismissed', 'sent'].includes(m.status); };
  let rows = [...recs, ...declined.filter((r) => !isClosed(r.ref)), ...aging.filter((r) => !isClosed(r.ref))];

  // Hydrate customer name + mailability for every row (declined already has a name; recs/aging need it).
  const ids = [...new Set(rows.map((r) => r.customerId).filter(Boolean))];
  const cust = new Map();
  for (let i = 0; i < ids.length; i += 300) {
    try { const { data } = await sb.from('customers').select('id, name, email, do_not_mail').in('id', ids.slice(i, i + 300)); (data || []).forEach((c) => cust.set(c.id, c)); } catch (_) {}
  }
  rows = rows.map((r) => {
    const c = cust.get(r.customerId) || {};
    const email = String(c.email || '').trim();
    return { ...r, customerName: r.customerName || c.name || 'Customer', hasEmail: !!email && !c.do_not_mail, doNotMail: !!c.do_not_mail };
  });

  const counts = { recommendation: 0, declined_estimate: 0, aging_water_heater: 0 };
  rows.forEach((r) => { counts[r.kind] = (counts[r.kind] || 0) + 1; });
  const totalValue = rows.reduce((s, r) => s + (r.valueCents || 0), 0);

  return (
    <div className="wrap" style={{ maxWidth: 1040 }}>
      <div className="h1" style={{ marginBottom: 2 }}>🎯 Opportunities</div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        Money we recommended, quoted, or should quote — in one place. Follow up, or batch a coupon campaign (an approver still releases every email).
      </div>
      <OppBoard rows={rows} counts={counts} totalValueCents={totalValue} kinds={OPP_KINDS} canCompose={canWorkOpportunities(role)} />
    </div>
  );
}

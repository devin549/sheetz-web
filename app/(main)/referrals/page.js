import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import ReferralReview from './ReferralReview';

export const dynamic = 'force-dynamic';

// Sales / GM review board for tech-submitted FloodBusterz / Reline opportunities. Open items first.
export default async function Referrals() {
  await requirePerm('seeReports', 'assignJobs', 'manageUsers', 'seeFinancials', 'seeCrew');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">💡 Sales Referrals</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();

  let rows = [];
  let needsMigration = false;
  try {
    const { data, error } = await sb.from('sales_referrals').select('*').order('created_at', { ascending: false }).limit(120);
    if (error) { if (/relation|does not exist|schema cache/i.test(error.message)) needsMigration = true; }
    else rows = data || [];
  } catch { /* ignore */ }

  // Sign the damage photos.
  await Promise.all(rows.map(async (r) => {
    const paths = Array.isArray(r.photo_paths) ? r.photo_paths : [];
    r.photos = await Promise.all(paths.map(async (p) => { try { const { data } = await sb.storage.from('job-photos').createSignedUrl(p, 3600); return data?.signedUrl || null; } catch { return null; } }));
  }));

  const open = rows.filter((r) => ['new', 'reviewing', 'approved'].includes(r.status));
  const closed = rows.filter((r) => ['sold', 'declined'].includes(r.status));
  const soldCount = rows.filter((r) => r.status === 'sold').length;

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="h1" style={{ marginBottom: 2 }}>💡 Sales Referrals</div>
      <p className="muted" style={{ fontSize: 13 }}>FloodBusterz &amp; Reline opportunities the field handed up. Scope them, approve, and close the loop — {soldCount} sold.</p>

      {needsMigration && <div className="notice">Run <code>supabase/102_sales_referrals.sql</code> to turn on the referral board.</div>}

      {!needsMigration && open.length === 0 && closed.length === 0 && (
        <div className="card"><span className="muted">No referrals yet. When a tech spots water damage or a bad sewer line, it lands here.</span></div>
      )}

      {open.length > 0 && (
        <>
          <div className="h2" style={{ marginTop: 14 }}>Open <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· {open.length}</span></div>
          <div style={{ display: 'grid', gap: 10 }}>{open.map((r) => <ReferralReview key={r.id} r={r} />)}</div>
        </>
      )}

      {closed.length > 0 && (
        <>
          <div className="h2" style={{ marginTop: 18 }}>Closed</div>
          <div style={{ display: 'grid', gap: 10 }}>{closed.slice(0, 30).map((r) => <ReferralReview key={r.id} r={r} />)}</div>
        </>
      )}
    </div>
  );
}

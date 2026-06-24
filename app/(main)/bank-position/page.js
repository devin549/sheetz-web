import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireRole } from '@/lib/guard';
import BankPositionClient from './BankPositionClient';

export const dynamic = 'force-dynamic';

export default async function BankPosition() {
  await requireRole(['owner', 'admin', 'gm', 'om', 'accounting']);

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Bank Position</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();

  // Manual bank balances
  const acctRes = await sb.from('bank_accounts').select('id, name, kind, balance_cents, as_of, note, sort').order('sort').order('name');
  const acctsMissing = acctRes.error && /could not find|does not exist|schema cache/i.test(acctRes.error.message || '');

  // Live AR — open, non-doubtful invoices (same rule as /past-due). Dollar `balance`.
  let arCents = 0;
  try {
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await sb.from('invoices').select('balance, doubtful, status').eq('status', 'open').range(from, from + 999);
      if (error || !data || !data.length) break;
      for (const i of data) { if (!i.doubtful) arCents += Math.round((Number(i.balance) || 0) * 100); }
      if (data.length < 1000) break;
    }
  } catch (_) { arCents = 0; }

  // Cash in transit — collected but not yet deposited (graceful if cash_custody not migrated).
  let transitCents = 0; let transitAvailable = true;
  const ccRes = await sb.from('cash_custody').select('amount_cents, status').in('status', ['collected', 'turned_in']);
  if (ccRes.error) transitAvailable = false;
  else transitCents = (ccRes.data || []).reduce((s, r) => s + (r.amount_cents || 0), 0);

  return (
    <div className="wrap" style={{ maxWidth: 880 }}>
      <div className="h1">Bank Position</div>
      <p className="muted">Cash on hand + what&apos;s in the pipeline. Bank balances are entered here; AR and cash-in-transit are live.</p>
      <BankPositionClient
        accounts={acctsMissing ? [] : (acctRes.data || [])}
        accountsMissing={acctsMissing}
        arCents={arCents}
        transitCents={transitCents}
        transitAvailable={transitAvailable}
      />
    </div>
  );
}

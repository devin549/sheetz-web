import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { summarize } from '@/lib/toolPurchase';
import PurchaseBoard from './PurchaseBoard';

// Manager-only: the tool-purchase payoff board. Company-bought tools paid down by weekly payroll deduction.
export default async function ToolPurchases() {
  const sb = getSupabaseAdmin();
  let plans = [];
  try {
    let { data, error } = await sb.from('tool_purchases').select('id, tool_name, tech_name, purchase_cents, weekly_pct, weekly_cents, paid_cents, vendor, status, started_on, waived').order('status', { ascending: true }).order('started_on', { ascending: false }).limit(100);
    if (error && /waived|column|schema cache/i.test(error.message || '')) {
      ({ data, error } = await sb.from('tool_purchases').select('id, tool_name, tech_name, purchase_cents, weekly_pct, weekly_cents, paid_cents, vendor, status, started_on').order('status', { ascending: true }).order('started_on', { ascending: false }).limit(100));
    }
    if (error) {
      if (/relation|column|schema cache|does not exist/i.test(error.message)) {
        return <div className="notice" style={{ marginTop: 16 }}>Run <code>supabase/98_tool_purchases.sql</code> to turn on tool purchase plans (weekly payroll payoff).</div>;
      }
      return null;
    }
    plans = data || [];
  } catch { return null; }

  const summary = summarize(plans);
  return <PurchaseBoard plans={plans} summary={summary} />;
}

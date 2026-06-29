import Link from 'next/link';
import { loadCockpitMoney } from '../cockpit';
import JobHeader from '../JobHeader';
import CloseoutCheckout from '../CloseoutCheckout';
import WorkSummaryCoach from '../WorkSummaryCoach';
import { can } from '@/lib/roles';
import { isStripeConfigured } from '@/lib/stripe';

export const dynamic = 'force-dynamic';
const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dial = (p) => String(p || '').replace(/[^0-9+]/g, '');

export default async function InvoiceTab({ params }) {
  const c = await loadCockpitMoney(params.id);
  if (!c.configured) return <div className="wrap"><div className="h1">Invoice</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;

  let invoices = [];
  try { const { data } = await c.sb.from('invoices').select('invoice_number, total, balance, status, created_at').eq('job_id', String(params.id)).order('created_at', { ascending: false }); invoices = data || []; } catch (_) {}
  const balance = invoices.reduce((s, v) => s + Math.max(0, Number(v.balance) || 0), 0);
  const amount = balance > 0 ? balance : (c.job.amount || 0);
  const canCollect = can(c.role, 'collectPayment') || can(c.role, 'changeStatus');
  // Work summary (migration 134) — the AI-watched "what I did" that shows as DESCRIPTION OF WORK. Best-effort.
  let workSummary = '';
  try { const { data: ws } = await c.sb.from('jobs').select('work_summary').eq('id', String(params.id)).maybeSingle(); workSummary = ws?.work_summary || ''; } catch (_) { /* pre-134 */ }
  const canEditSummary = can(c.role, 'changeStatus');
  // Full pay menu: tap reader (preferred) · send card link · key in card · bank/ACH. Reader button unlocks
  // once a WisePOS E is paired (migration 123). stripeReady gates the whole menu on STRIPE_SECRET_KEY.
  const stripeReady = isStripeConfigured();
  let hasReader = false;
  try { const { count } = await c.sb.from('terminal_readers').select('id', { count: 'exact', head: true }); hasReader = (count || 0) > 0; } catch (_) { /* pre-123 */ }
  // Office-billed account → lead the pay menu with "don't collect; the office invoices." Best-effort.
  let officeBilled = false, netDays = 0;
  const custId = c.customer?.id || c.job?.customer_id;
  if (custId) {
    try { const { data: ct } = await c.sb.from('customers').select('net_terms_days, bill_from_office').eq('id', custId).maybeSingle(); netDays = Number(ct?.net_terms_days) || 0; officeBilled = !!ct?.bill_from_office || netDays > 0; }
    catch (_) { try { const { data: ct } = await c.sb.from('customers').select('net_terms_days').eq('id', custId).maybeSingle(); netDays = Number(ct?.net_terms_days) || 0; officeBilled = netDays > 0; } catch (_2) { /* pre-132 */ } }
  }

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <JobHeader job={c.job} customer={c.customer} tab="Invoice" />

      {canEditSummary && <WorkSummaryCoach jobId={params.id} jobType={c.job.job_type || ''} initial={workSummary} />}

      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontWeight: 800 }}>💳 Invoice · this job</span>
          <span className="pill" style={{ marginLeft: 'auto', color: balance > 0 ? 'var(--red)' : 'var(--green)' }}>{balance > 0 ? `${money(balance)} due` : invoices.length ? 'paid' : 'no invoice yet'}</span>
        </div>
        {invoices.length ? invoices.map((v, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 13 }}>Invoice {v.invoice_number || ''}</div><div className="muted" style={{ fontSize: 11 }}>{v.status || ''}</div></div>
            <div style={{ textAlign: 'right' }}><div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{money(v.total)}</div>{(Number(v.balance) || 0) > 0 && <div style={{ fontSize: 11, color: 'var(--red)' }}>{money(v.balance)} owed</div>}</div>
          </div>
        )) : <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>No invoice imported for this job yet. You can still collect payment below, or build the invoice from the estimate.</div>}
        <div style={{ marginTop: 8 }}>
          <Link href={`/job/${params.id}/invoice/summary`} className="pill" style={{ color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>📄 View / print invoice summary →</Link>
        </div>
        {(c.customer?.id || c.job?.customer_id) && (
          <div style={{ marginTop: 8 }}>
            <Link href={`/invoices?customer=${c.customer?.id || c.job.customer_id}`} className="pill">All of {c.customer?.name || 'this customer'}’s invoices →</Link>
          </div>
        )}
      </div>

      {canCollect && <CloseoutCheckout jobId={params.id} suggested={amount} tel={dial(c.customer.phone)} hasReader={hasReader} stripeReady={stripeReady} officeBilled={officeBilled} netDays={netDays} />}
    </div>
  );
}

import Link from 'next/link';
import { loadCockpitMoney } from '../cockpit';
import JobHeader from '../JobHeader';
import EstimateProofPanel from '../pricebook/EstimateProofPanel';
import EstimatePresent from './EstimatePresent';
import CloseoutCheckout from '../CloseoutCheckout';
import WorkSummaryCoach from '../WorkSummaryCoach';
import { can } from '@/lib/roles';
import { isStripeConfigured } from '@/lib/stripe';

export const dynamic = 'force-dynamic';
const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dial = (p) => String(p || '').replace(/[^0-9+]/g, '');

const SUGGEST = [
  [/drain|clog|sewer|rooter/i, ['Drain cleaning', 'Camera inspection', 'Hydro-jetting', 'Cleanout install', 'Membership']],
  [/water ?heater|tankless/i, ['Water heater install', 'Tankless install', 'Expansion tank', 'Flush + service', 'Membership']],
  [/leak|faucet|toilet/i, ['Faucet replace', 'Toilet rebuild', 'Supply lines', 'Shutoff valves', 'Membership']],
  [/excavat|dig|main|replace/i, ['Sewer replacement', 'Spot repair', 'Locate + scope', 'Permit', 'Restoration']],
];
const suggestFor = (t) => (SUGGEST.find(([re]) => re.test(String(t || ''))) || [null, ['Diagnostic', 'Repair', 'Membership', 'Financing']])[1];

// 💵 QUOTE — one tab for the whole money lifecycle. It's an ESTIMATE until the customer responds: accept →
// it becomes the INVOICE (collect payment), decline → it stays a logged estimate. (Merged the old separate
// Estimate + Invoice tabs.)
export default async function QuoteTab({ params }) {
  const c = await loadCockpitMoney(params.id);
  if (!c.configured) return <div className="wrap"><div className="h1">Quote</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = c.sb;
  const sugg = suggestFor(c.job.job_type);

  // Sent estimates for this job + their proof timeline (Pricebook builds, this tab tracks). Best-effort.
  let estimates = [];
  try {
    const { data: rows } = await sb.from('pricebook_estimates').select('token, headline, subtotal, status, approved_name, approval_method, witnessed_by_name, responded_at, viewed_at, created_at').eq('job_id', c.job.id).order('created_at', { ascending: false }).limit(20);
    const list = rows || [];
    const tokens = list.map((e) => e.token);
    const byTok = {};
    if (tokens.length) { try { const { data: evs } = await sb.from('pricebook_estimate_events').select('token, event_type, method, actor, note, amount, created_at').in('token', tokens).order('created_at', { ascending: true }).limit(300); (evs || []).forEach((ev) => { (byTok[ev.token] = byTok[ev.token] || []).push(ev); }); } catch (_) {} }
    estimates = list.map((e) => ({ ...e, events: byTok[e.token] || [] }));
  } catch (_) {}
  const latest = estimates[0] || null;

  // Invoices for this job (an estimate becomes one on accept). Best-effort.
  let invoices = [];
  try { const { data } = await sb.from('invoices').select('invoice_number, total, balance, status, created_at').eq('job_id', String(params.id)).order('created_at', { ascending: false }); invoices = data || []; } catch (_) {}
  const balance = invoices.reduce((s, v) => s + Math.max(0, Number(v.balance) || 0), 0);
  const amount = balance > 0 ? balance : (c.job.amount || 0);

  // Billing context + work summary + pay-menu gates.
  let workSummary = '';
  try { const { data: ws } = await sb.from('jobs').select('work_summary').eq('id', String(params.id)).maybeSingle(); workSummary = ws?.work_summary || ''; } catch (_) { /* pre-134 */ }
  let netDays = 0, officeBilled = false;
  const custId = c.customer?.id || c.job?.customer_id;
  if (custId) {
    try { const { data: ct } = await sb.from('customers').select('net_terms_days, bill_from_office').eq('id', custId).maybeSingle(); netDays = Number(ct?.net_terms_days) || 0; officeBilled = !!ct?.bill_from_office || netDays > 0; }
    catch (_) { try { const { data: ct } = await sb.from('customers').select('net_terms_days').eq('id', custId).maybeSingle(); netDays = Number(ct?.net_terms_days) || 0; officeBilled = netDays > 0; } catch (_2) { /* pre-132 */ } }
  }
  let hasReader = false;
  try { const { count } = await sb.from('terminal_readers').select('id', { count: 'exact', head: true }); hasReader = (count || 0) > 0; } catch (_) { /* pre-123 */ }
  const stripeReady = isStripeConfigured();
  const canCollect = can(c.role, 'collectPayment') || can(c.role, 'changeStatus');
  const canEditSummary = can(c.role, 'changeStatus');

  // Lifecycle badge.
  const approved = latest?.status === 'approved' || invoices.length > 0;
  const declined = latest?.status === 'declined' && !invoices.length;
  const paid = invoices.length > 0 && balance <= 0;
  const stage = paid ? ['✅ Paid', 'var(--green)'] : approved ? ['💳 Approved → Invoice', 'var(--amber)'] : declined ? ['✗ Declined', 'var(--red)'] : latest ? ['🧾 Estimate — awaiting customer', 'var(--fg-2)'] : ['🧾 No estimate yet', 'var(--fg-3)'];
  // The invoice/payment block earns its place once there's something to bill (approved or an invoice exists).
  const showInvoice = approved || invoices.length > 0;

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <JobHeader job={c.job} customer={c.customer} tab="Quote" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 2px' }}>
        <span style={{ fontWeight: 800, fontSize: 13 }}>💵 Quote</span>
        <span className="pill" style={{ marginLeft: 'auto', fontWeight: 800, color: stage[1] }}>{stage[0]}</span>
      </div>

      {/* ── ESTIMATE — present / send / approve (or build prompt) ── */}
      {latest ? (
        <EstimatePresent jobId={params.id} estimate={latest} net30Days={netDays} />
      ) : (
        <div className="card card-amber" style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>🧾 No estimate yet</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Build the job in the Pricebook — pick items / Good·Better·Best — then it lands here to present &amp; send. Approval drops fast after ~8 min post-diagnosis, so build it on site.</div>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Likely for this job type</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>{sugg.map((s) => <span key={s} className="pill">{s}</span>)}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href={`/job/${params.id}/pricebook`} className="btn" style={{ textDecoration: 'none' }}>🛒 Build it in the Pricebook →</Link>
            <Link href="/open-estimates" className="pill" style={{ display: 'inline-flex', alignItems: 'center' }}>All open estimates</Link>
          </div>
        </div>
      )}

      {/* ── INVOICE & PAYMENT — appears once the estimate is approved (or an invoice exists) ── */}
      {showInvoice && (
        <>
          {canEditSummary && <WorkSummaryCoach jobId={params.id} jobType={c.job.job_type || ''} initial={workSummary} />}
          <div className="card" style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontWeight: 800 }}>💳 Invoice · this job</span>
              <span className="pill" style={{ marginLeft: 'auto', color: balance > 0 ? 'var(--red)' : 'var(--green)' }}>{balance > 0 ? `${money(balance)} due` : invoices.length ? 'paid' : 'becomes an invoice on accept'}</span>
            </div>
            {invoices.length ? invoices.map((v, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 13 }}>Invoice {v.invoice_number || ''}</div><div className="muted" style={{ fontSize: 11 }}>{v.status || ''}</div></div>
                <div style={{ textAlign: 'right' }}><div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{money(v.total)}</div>{(Number(v.balance) || 0) > 0 && <div style={{ fontSize: 11, color: 'var(--red)' }}>{money(v.balance)} owed</div>}</div>
              </div>
            )) : <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Approved — the invoice builds from this estimate. Collect below, or send it.</div>}
            <div style={{ marginTop: 8 }}>
              <Link href={`/job/${params.id}/invoice/summary`} className="pill" style={{ color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>📄 View / print invoice summary →</Link>
            </div>
            {custId && (
              <div style={{ marginTop: 8 }}>
                <Link href={`/invoices?customer=${custId}`} className="pill">All of {c.customer?.name || 'this customer'}’s invoices →</Link>
              </div>
            )}
          </div>
          {canCollect && <CloseoutCheckout jobId={params.id} suggested={amount} tel={dial(c.customer.phone)} customerEmail={c.customer.email || ''} hasReader={hasReader} stripeReady={stripeReady} officeBilled={officeBilled} netDays={netDays} />}
        </>
      )}

      {/* ── Sent estimates & approval proof — the record of what was sent + how the customer responded. ── */}
      <EstimateProofPanel estimates={estimates} />
    </div>
  );
}

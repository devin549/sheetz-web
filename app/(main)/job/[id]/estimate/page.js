import Link from 'next/link';
import { loadCockpitMoney } from '../cockpit';
import JobHeader from '../JobHeader';
import EstimateProofPanel from '../pricebook/EstimateProofPanel';
import EstimatePresent from './EstimatePresent';
import CloseoutCheckout from '../CloseoutCheckout';
import WorkSummaryCoach from '../WorkSummaryCoach';
import CompletionSignature from '../CompletionSignature';
import SendInvoice from './SendInvoice';
import { can } from '@/lib/roles';
import { isStripeConfigured } from '@/lib/stripe';
import { getLegalTerms } from '@/lib/estimateTerms';

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
    const { data: rows } = await sb.from('pricebook_estimates').select('token, headline, subtotal, lines, status, approved_name, approval_method, witnessed_by_name, responded_at, viewed_at, created_at').eq('job_id', c.job.id).order('created_at', { ascending: false }).limit(20);
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

  // Line items + running totals for the close flow (from the approved estimate → the invoice snapshot).
  const approvedEst = estimates.find((e) => e.status === 'approved') || latest;
  const items = Array.isArray(approvedEst?.lines) ? approvedEst.lines : [];
  const subtotal = Number(approvedEst?.subtotal) || items.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.quantity) || 1), 0) || (c.job.amount || 0);
  const paidSoFar = Math.max(0, subtotal - balance);
  // Completion signature (the "satisfied with the work" sign-off) + its counsel-drafted terms.
  let closeout = null;
  try { const { data } = await sb.from('job_closeout').select('completion_signature, completion_signed_name, completion_signed_at').eq('job_id', String(params.id)).maybeSingle(); closeout = data || null; } catch (_) {}
  const completionTerms = await getLegalTerms(sb, 'completion_acceptance');

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

      {/* ── CLOSE-OUT FLOW — top to bottom: items · summary · collect · sign · preview · email ── */}
      {showInvoice && (
        <>
          {/* 1️⃣ ITEMS — what was done / what's on the invoice */}
          <div className="card" style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>🧾 Items</div>
            {items.length ? (
              <div style={{ display: 'grid', gap: 2 }}>
                {items.map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '5px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>{l.name || 'Item'}{Number(l.quantity) > 1 ? ` ×${l.quantity}` : ''}{l.description ? <div className="muted" style={{ fontSize: 11 }}>{l.description}</div> : null}</div>
                    <div style={{ fontFamily: 'var(--mono, monospace)', fontWeight: 700 }}>{money((Number(l.price) || 0) * (Number(l.quantity) || 1))}</div>
                  </div>
                ))}
              </div>
            ) : <div className="muted" style={{ fontSize: 12.5 }}>Approved — line items build from the estimate. <Link href={`/job/${params.id}/pricebook`} style={{ color: 'var(--amber)' }}>Edit in the Pricebook →</Link></div>}
          </div>

          {/* 2️⃣ SUMMARY — totals */}
          <div className="card" style={{ marginTop: 10 }}>
            {invoices[0]?.invoice_number && <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Invoice {invoices[0].invoice_number}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}><span className="muted">Subtotal</span><span style={{ fontFamily: 'var(--mono, monospace)' }}>{money(subtotal)}</span></div>
            {paidSoFar > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: 'var(--green)' }}><span>Paid so far</span><span style={{ fontFamily: 'var(--mono, monospace)' }}>−{money(paidSoFar)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 15, padding: '6px 0 0', borderTop: '1px solid var(--border)', marginTop: 4, color: balance > 0 ? 'var(--red)' : 'var(--green)' }}><span>{balance > 0 ? 'Balance due' : 'Paid in full'}</span><span style={{ fontFamily: 'var(--mono, monospace)' }}>{money(balance)}</span></div>
          </div>

          {canEditSummary && <WorkSummaryCoach jobId={params.id} jobType={c.job.job_type || ''} initial={workSummary} />}

          {/* 3️⃣ COLLECTION — cash · card · financing · Net-30 (office-billed customers show the bill-to-office banner) */}
          {canCollect && <CloseoutCheckout jobId={params.id} suggested={amount} tel={dial(c.customer.phone)} customerEmail={c.customer.email || ''} hasReader={hasReader} stripeReady={stripeReady} officeBilled={officeBilled} netDays={netDays} />}

          {/* 4️⃣ SIGNATURE — final acceptance ("satisfied with the work") */}
          <CompletionSignature jobId={params.id} terms={completionTerms.content} signedName={closeout?.completion_signed_name} signedAt={closeout?.completion_signed_at} />

          {/* 5️⃣ PREVIEW INVOICE */}
          <Link href={`/job/${params.id}/invoice/summary`} className="card" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
            <span style={{ fontSize: 20 }}>📄</span>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 13 }}>Preview / print invoice</div><div className="muted" style={{ fontSize: 11.5 }}>Full invoice — items, totals, both signatures + terms.</div></div>
            <span style={{ color: 'var(--amber)', fontWeight: 800 }}>›</span>
          </Link>

          {/* 6️⃣ EMAIL — send the invoice (or paid receipt) to the customer + a different address */}
          {canCollect && <SendInvoice jobId={params.id} customerEmail={c.customer.email || ''} paid={paid} balance={balance} />}

          {custId && <div style={{ marginTop: 8 }}><Link href={`/invoices?customer=${custId}`} className="pill">All of {c.customer?.name || 'this customer'}’s invoices →</Link></div>}
        </>
      )}

      {/* ── Sent estimates & approval proof — the record of what was sent + how the customer responded. ── */}
      <EstimateProofPanel estimates={estimates} />
    </div>
  );
}

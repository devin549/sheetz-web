import { requireHref } from '@/lib/guard';
import { cardFeeReport, isStripeConfigured } from '@/lib/stripe';

export const dynamic = 'force-dynamic';
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString();

export default async function CardFees({ searchParams }) {
  await requireHref('/card-fees');
  const days = Math.min(365, Math.max(7, parseInt(searchParams?.days, 10) || 60));

  if (!isStripeConfigured()) {
    return <div className="wrap"><div className="h1">💳 Card Fees</div><div className="notice">Add <code>STRIPE_SECRET_KEY</code> in Vercel to pull payment data.</div></div>;
  }
  const r = await cardFeeReport(days);

  const Stat = ({ label, value, color, sub }) => (
    <div className="card" style={{ padding: '13px 15px' }}>
      <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--amber)', marginTop: 3 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11 }}>{sub}</div>}
    </div>
  );

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="h1">💳 Card Fees</div>
      <p className="muted">What CB nets on processing — the convenience fee you collect, minus Stripe's actual cut. Live from Stripe.</p>

      <div style={{ display: 'flex', gap: 6, margin: '4px 0 14px' }}>
        {[30, 60, 90].map((d) => <a key={d} href={`/card-fees?days=${d}`} className="pill" style={{ fontWeight: d === days ? 800 : 600, background: d === days ? 'var(--accent)' : 'var(--surface-2)', color: d === days ? '#fff' : 'var(--fg-2)' }}>Last {d}d</a>)}
      </div>

      {!r.ok ? (
        <div className="notice">Couldn’t pull Stripe data: {r.error}</div>
      ) : r.n === 0 ? (
        <div className="card"><span className="muted">No payments in the last {days} days yet — they’ll show here once customers start paying.</span></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
            <Stat label="Processed" value={money(r.grossDollars)} sub={`${r.n} payments (${r.cardN} card · ${r.achN} bank)`} />
            <Stat label="Fees you collected" value={money(r.ourFeeDollars)} color="var(--green)" sub="the 4% convenience fee" />
            <Stat label="Stripe's cut" value={money(r.stripeCostDollars)} color="var(--red)" sub="their actual fees" />
            <Stat label="Your net on processing" value={money(r.netDollars)} color={r.netDollars >= 0 ? 'var(--green-bright)' : 'var(--red)'} sub={r.netDollars >= 0 ? 'profit after Stripe' : 'cost after Stripe'} />
          </div>
          {r.refundedDollars > 0 && <div className="muted" style={{ fontSize: 12 }}>Refunded in this window: {money(r.refundedDollars)}.</div>}
          <div className="card" style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5 }}>
            <strong>How to read it:</strong> you collected <strong style={{ color: 'var(--green)' }}>{money(r.ourFeeDollars)}</strong> in convenience fees, Stripe took <strong style={{ color: 'var(--red)' }}>{money(r.stripeCostDollars)}</strong>, so processing {r.netDollars >= 0 ? 'made you' : 'cost you'} <strong style={{ color: r.netDollars >= 0 ? 'var(--green-bright)' : 'var(--red)' }}>{money(Math.abs(r.netDollars))}</strong> over {days} days. Bank/ACH payments carry no convenience fee but cost almost nothing — they pull the net up on big invoices.
          </div>
        </>
      )}
    </div>
  );
}

'use client';

// ⌨️ Virtual terminal — staff keys a card by hand (phone order / card in hand) as a FALLBACK when no reader
// is available. Card fields are Stripe Elements: the number/expiry/CVC go straight to Stripe, never to our
// server (keeps us at the lowest PCI tier). We confirm with the MOTO PaymentIntent's client_secret, then
// re-verify server-side via confirmKeyedCharge before recording.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { confirmKeyedCharge } from './checkoutActions';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = PK ? loadStripe(PK) : null;

function Form({ jobId, clientSecret, paymentIntentId, totals, onPaid, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function charge() {
    if (!stripe || !elements) return;
    setErr(null); setBusy(true);
    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: elements.getElement(CardElement) },
    });
    if (error) { setErr(error.message || 'Card was declined.'); setBusy(false); return; }
    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'requires_capture')) {
      const r = await confirmKeyedCharge(jobId, paymentIntentId); // server re-verifies + records
      setBusy(false);
      if (r.ok && r.paid) { router.refresh(); onPaid(); }
      else setErr(r.msg || 'Charge could not be confirmed.');
    } else { setErr('Payment not completed.'); setBusy(false); }
  }

  const cardStyle = { style: { base: { fontSize: '16px', color: '#e8e8e8', '::placeholder': { color: '#7a7a7a' } }, invalid: { color: 'var(--red)' } } };

  return (
    <div>
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 11px', marginBottom: 8 }}>
        <CardElement options={cardStyle} />
      </div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>Charging {money(totals.total)} ({money(totals.base)} + {money(totals.fee)} card fee).</div>
      {err && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={charge} disabled={busy || !stripe} className="btn" style={{ flex: 1, opacity: (busy || !stripe) ? 0.6 : 1 }}>{busy ? 'Charging…' : `Charge ${money(totals.total)}`}</button>
        <button onClick={onCancel} disabled={busy} className="btn btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

export default function KeyInCard(props) {
  if (!PK) return <div className="muted" style={{ fontSize: 12, color: 'var(--amber)' }}>⚠️ Add <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> in Vercel to key in cards.</div>;
  return <Elements stripe={stripePromise}><Form {...props} /></Elements>;
}

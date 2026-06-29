'use client';

// 💳 Close-out checkout — the ServiceTitan/FieldEdge "payment pops up with the total" screen. Tech sees the
// amount pre-filled and picks how to collect:
//   • Collect on reader → WisePOS E tap/insert.   [startReaderCharge]   ← PREFERRED (card-present, cheaper)
//   • Send link         → customer pays on phone.  [createJobPayLink]
//   • Send bank/ACH link → no card fee, last resort. [createJobAchLink]
// All server-side; card data never touches this component. A paid charge auto-flips disposition to paid_card.
// (Key-in / MOTO removed by Devin — reader is preferred, link/ACH cover the rest.)
import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createJobPayLink } from '../../my-day/actions';
import { startReaderCharge, pollReaderCharge, cancelReaderCharge, createJobAchLink } from './checkoutActions';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CloseoutCheckout({ jobId, suggested, tel, hasReader, stripeReady, officeBilled = false, netDays = 0 }) {
  const router = useRouter();
  const [amt, setAmt] = useState(suggested ? String(suggested) : '');
  const [payNow, setPayNow] = useState(false); // office-billed: collection hidden until the customer chooses to pay now
  const [mode, setMode] = useState(null); // null | 'link' | 'reader' | 'ach'
  const [link, setLink] = useState(null);
  const [reader, setReader] = useState(null);
  const [readerState, setReaderState] = useState(null); // 'waiting' | 'paid' | 'failed'
  const [err, setErr] = useState(null);
  const [pending, start] = useTransition();
  const pollRef = useRef(null);
  const pollingRef = useRef(false); // a tick is in flight — skip overlapping ticks so we never double-record a paid charge

  const amtNum = Number(amt);
  const valid = amtNum > 0;

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function makeLink() {
    setErr(null); setMode('link');
    start(async () => { const r = await createJobPayLink(jobId, amtNum); if (r.ok) setLink(r); else { setErr(r.msg); setMode(null); } });
  }

  function makeAch() {
    setErr(null); setMode('ach');
    start(async () => { const r = await createJobAchLink(jobId, amtNum); if (r.ok) setLink({ ...r, ach: true }); else { setErr(r.msg); setMode(null); } });
  }

  function startReader() {
    setErr(null); setMode('reader');
    start(async () => {
      const r = await startReaderCharge(jobId, amtNum);
      if (!r.ok) { setErr(r.msg); setMode(null); return; }
      setReader(r); setReaderState('waiting');
      pollRef.current = setInterval(async () => {
        if (pollingRef.current) return; // prior tick still awaiting — don't fire a second pollReaderCharge
        pollingRef.current = true;
        try {
          const p = await pollReaderCharge(jobId, r.paymentIntentId);
          if (!p.ok) return;
          if (p.paid) { clearInterval(pollRef.current); setReaderState('paid'); router.refresh(); }
          else if (p.done) { clearInterval(pollRef.current); setReaderState('failed'); setErr(p.lastError || 'Charge was canceled or declined.'); }
        } finally { pollingRef.current = false; }
      }, 2200);
    });
  }

  async function cancelReader() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (reader) await cancelReaderCharge(reader.readerId, reader.paymentIntentId);
    setReader(null); setReaderState(null); setMode(null);
  }

  const card = { borderLeft: '3px solid #635bff', marginTop: 10 };
  const input = { flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 15 };

  // PAID (reader).
  if (readerState === 'paid') {
    const total = reader.totalDollars;
    const how = `on ${reader.readerLabel}`;
    return (
      <div className="card" style={{ ...card, borderLeftColor: 'var(--green)' }}>
        <div style={{ fontWeight: 800, color: 'var(--green)', fontSize: 15 }}>✅ Paid {money(total)} {how}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Receipt recorded — payment marked “Paid · card” on the closeout.</div>
      </div>
    );
  }

  // WAITING — reader prompting the customer to tap.
  if (readerState === 'waiting' && reader) {
    return (
      <div className="card" style={card}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>💳 Waiting for tap…</div>
        <div style={{ fontSize: 13 }}>Have the customer tap or insert their card on <strong>{reader.readerLabel}</strong>.</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Charging {money(reader.totalDollars)} ({money(reader.baseDollars)} + {money(reader.feeDollars)} card fee).</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <span className="pill" style={{ color: 'var(--amber)' }}>● Reader live</span>
          <button onClick={cancelReader} className="btn btn-ghost" style={{ marginLeft: 'auto' }}>Cancel</button>
        </div>
      </div>
    );
  }

  // OFFICE-BILLED — the tech collects nothing; the office invoices. Lead with that, and keep collection
  // tucked behind a tap in case the customer chooses to pay on the spot anyway.
  if (officeBilled && !payNow && !link) {
    return (
      <div className="card" style={{ ...card, borderLeftColor: 'var(--amber)' }}>
        <div style={{ fontWeight: 800 }}>🏛 Billed by the office{netDays ? ` · Net-${netDays}` : ''}</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Don’t collect on site — the office invoices this customer{netDays ? `, due in ${netDays} days` : ' (due on receipt)'}. Just finish the close-out.</div>
        <button onClick={() => setPayNow(true)} className="btn btn-ghost" style={{ marginTop: 10, fontSize: 12.5 }}>Customer wants to pay now anyway? →</button>
      </div>
    );
  }

  return (
    <div className="card" style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 800 }}>💳 Collect payment</span>
        {officeBilled && <button onClick={() => setPayNow(false)} className="pill" style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 11, color: 'var(--amber)' }}>🏛 Office-billed — collect nothing</button>}
      </div>

      {!stripeReady && <div className="muted" style={{ fontSize: 12, marginBottom: 8, color: 'var(--amber)' }}>⚠️ Stripe isn’t set up yet — add <code>STRIPE_SECRET_KEY</code> in Vercel to take payment.</div>}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>$</span>
        <input type="number" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0.00" style={input} />
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Customer pays this + a 4% card fee.</div>

      {!link ? (
        <>
          {/* PREFERRED: tap on the reader. */}
          <button onClick={startReader} disabled={pending || !valid || !stripeReady || !hasReader} className="btn" style={{ width: '100%', marginTop: 10, opacity: (pending || !valid || !stripeReady || !hasReader) ? 0.55 : 1 }}>
            {pending && mode === 'reader' ? '…' : '💳 Collect on reader'}{hasReader ? '  ·  preferred' : ''}
          </button>
          {hasReader && <div className="muted" style={{ fontSize: 10.5, marginTop: 5, textAlign: 'center' }}>Use the reader whenever you can — it’s cheaper and more secure than the options below.</div>}

          {/* Fallback: send the customer a pay link. */}
          <button onClick={makeLink} disabled={pending || !valid || !stripeReady} className="btn btn-ghost" style={{ width: '100%', marginTop: 8, opacity: (pending || !valid || !stripeReady) ? 0.55 : 1 }}>
            {pending && mode === 'link' ? '…' : '✉️ Send pay link'}
          </button>

          {/* LAST RESORT: bank transfer — no card fee but slow + can bounce. */}
          <button onClick={makeAch} disabled={pending || !valid || !stripeReady} className="btn btn-ghost" style={{ width: '100%', marginTop: 8, fontSize: 12.5, opacity: (pending || !valid || !stripeReady) ? 0.55 : 1 }}>
            {pending && mode === 'ach' ? '…' : '🏦 Send bank (ACH) link — last resort'}
          </button>
          <div className="muted" style={{ fontSize: 10.5, marginTop: 5, textAlign: 'center' }}>No 4% card fee, but takes ~4 business days and can bounce. Use only if card won’t work.</div>
        </>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--purple)', marginBottom: 6 }}>
            {link.ach ? `Bank link ready — customer pays ${money(link.totalDollars)} (no card fee)` : `Link ready — customer pays ${money(link.totalDollars)} (${money(link.baseDollars)} + ${money(link.feeDollars)} fee)`}
          </div>
          {link.ach && <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>🏦 Bank transfer — settles in ~4 business days; the job isn’t paid until it clears.</div>}
          <input readOnly value={link.url} onFocus={(e) => e.target.select()} style={{ ...input, width: '100%', fontSize: 12, marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {tel && <a href={`sms:${tel}?body=${encodeURIComponent((link.ach ? 'Pay your Clog Busterz invoice by bank transfer here: ' : 'Pay your Clog Busterz invoice here: ') + link.url)}`} className="btn" style={{ flex: 1, textAlign: 'center', minWidth: 120, textDecoration: 'none' }}>✉️ Text customer</a>}
            <a href={link.url} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Open ↗</a>
            <button onClick={() => { setLink(null); setMode(null); }} className="btn btn-ghost">↺ New</button>
          </div>
        </div>
      )}

      {!hasReader && stripeReady && <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>No card reader paired — “Collect on reader” unlocks once you add a WisePOS E in Card Readers settings.</div>}
      {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{err}</div>}
    </div>
  );
}

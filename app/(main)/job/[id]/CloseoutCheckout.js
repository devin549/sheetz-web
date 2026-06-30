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
import { startReaderCharge, pollReaderCharge, cancelReaderCharge, createJobAchLink, recordManualPayment } from './checkoutActions';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Scale a captured photo down before sending (keeps the cash-proof upload small).
function fileToScaledDataUrl(file, max = 1300) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); resolve(c.toDataURL('image/jpeg', 0.85)); };
    img.onerror = () => resolve(null);
    const fr = new FileReader(); fr.onload = () => { img.src = fr.result; }; fr.readAsDataURL(file);
  });
}

export default function CloseoutCheckout({ jobId, suggested, tel, hasReader, stripeReady, officeBilled = false, netDays = 0 }) {
  const router = useRouter();
  const [amt, setAmt] = useState(suggested ? String(suggested) : '');
  const [payNow, setPayNow] = useState(false); // office-billed: collection hidden until the customer chooses to pay now
  const [mode, setMode] = useState(null); // null | 'link' | 'reader' | 'ach'
  const [link, setLink] = useState(null);
  const [reader, setReader] = useState(null);
  const [readerState, setReaderState] = useState(null); // 'waiting' | 'paid' | 'failed'
  const [err, setErr] = useState(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkNo, setCheckNo] = useState('');
  const [checkId, setCheckId] = useState('');
  const [cashOpen, setCashOpen] = useState(false);
  const [cashPhoto, setCashPhoto] = useState(null);
  const cashRef = useRef();
  const [manualPaid, setManualPaid] = useState(null); // { method, total }
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

  const pickCash = async (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const url = await fileToScaledDataUrl(f); setCashPhoto(url); e.target.value = ''; };
  function takeCash() {
    setErr(null);
    if (!cashPhoto) { setErr('Take a photo of the cash fanned out first.'); return; }
    start(async () => { const r = await recordManualPayment(jobId, { method: 'cash', amountDollars: amtNum, cashPhoto }); if (r.ok) setManualPaid({ method: 'cash', total: r.totalDollars }); else setErr(r.msg); });
  }
  function takeCheck() {
    setErr(null);
    if (!checkNo.trim() || !checkId.trim()) { setErr('Enter the check number and the ID written on the check.'); return; }
    start(async () => { const r = await recordManualPayment(jobId, { method: 'check', amountDollars: amtNum, checkNumber: checkNo, idOnCheck: checkId }); if (r.ok) setManualPaid({ method: 'check', total: r.totalDollars, checkNumber: r.checkNumber }); else setErr(r.msg); });
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

  // PAID (cash / check) — recorded in person.
  if (manualPaid) {
    return (
      <div className="card" style={{ ...card, borderLeftColor: 'var(--green)' }}>
        <div style={{ fontWeight: 800, color: 'var(--green)', fontSize: 15 }}>✅ Paid {money(manualPaid.total)} · {manualPaid.method === 'cash' ? 'cash' : `check #${manualPaid.checkNumber}`}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{manualPaid.method === 'cash' ? 'Recorded — marked “Paid · cash” (turn the cash in to the office).' : 'Recorded — marked “Paid · check” with the check number + ID on file.'}</div>
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
      <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Customer pays this. <strong>Card</strong> adds a 4% fee; <strong>cash &amp; check</strong> don’t.</div>

      {!link ? (
        <>
          {/* PREFERRED: tap on the reader. */}
          <button onClick={startReader} disabled={pending || !valid || !stripeReady || !hasReader} className="btn" style={{ width: '100%', marginTop: 10, opacity: (pending || !valid || !stripeReady || !hasReader) ? 0.55 : 1 }}>
            {pending && mode === 'reader' ? '…' : '💳 Collect on reader'}{hasReader ? '  ·  preferred' : ''}
          </button>
          {hasReader && <div className="muted" style={{ fontSize: 10.5, marginTop: 5, textAlign: 'center' }}>Use the reader whenever you can — cheaper + more secure.</div>}

          {/* Cash + check — in person, no Stripe, no fee. Check captures the check # + the ID written on it. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => setCashOpen((v) => !v)} disabled={!valid} className="btn btn-ghost" style={{ flex: 1, opacity: !valid ? 0.55 : 1, borderColor: cashOpen ? 'var(--green)' : undefined, color: cashOpen ? 'var(--green)' : undefined }}>💵 Cash</button>
            <button onClick={() => setCheckOpen((v) => !v)} disabled={!valid} className="btn btn-ghost" style={{ flex: 1, opacity: !valid ? 0.55 : 1, borderColor: checkOpen ? 'var(--amber)' : undefined, color: checkOpen ? 'var(--amber)' : undefined }}>🧾 Check</button>
          </div>
          {cashOpen && (
            <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--green)', display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 11.5, color: 'var(--fg-2)', lineHeight: 1.45 }}>📸 <strong>Fan the bills out and snap a photo</strong> — proof of the cash collected. Goes to the office, not the customer.</div>
              <input ref={cashRef} type="file" accept="image/*" capture="environment" onChange={pickCash} style={{ display: 'none' }} />
              <button onClick={() => cashRef.current && cashRef.current.click()} className="btn btn-ghost" style={{ borderColor: cashPhoto ? 'var(--green)' : 'var(--purple)', color: cashPhoto ? 'var(--green)' : 'var(--purple)' }}>{cashPhoto ? '✓ Cash photo attached — retake' : '📷 Photo the cash (fanned out)'}</button>
              <button onClick={takeCash} disabled={pending || !valid || !cashPhoto} className="btn" style={{ opacity: (pending || !valid || !cashPhoto) ? 0.55 : 1 }}>{pending ? '…' : `✓ Record cash · ${money(amtNum)}`}</button>
            </div>
          )}
          {checkOpen && (
            <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--amber-dim)', display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 11, color: 'var(--fg-2)' }}>Check number
                <input value={checkNo} onChange={(e) => setCheckNo(e.target.value)} inputMode="numeric" placeholder="e.g. 1042" style={{ ...input, width: '100%', marginTop: 3 }} />
              </label>
              <label style={{ fontSize: 11, color: 'var(--fg-2)' }}>ID written on the check (driver’s license #)
                <input value={checkId} onChange={(e) => setCheckId(e.target.value)} placeholder="DL # the customer wrote on it" style={{ ...input, width: '100%', marginTop: 3 }} />
              </label>
              <div className="muted" style={{ fontSize: 10.5 }}>CB policy: write the customer’s ID on every check before accepting it.</div>
              <button onClick={takeCheck} disabled={pending || !valid || !checkNo.trim() || !checkId.trim()} className="btn" style={{ opacity: (pending || !valid || !checkNo.trim() || !checkId.trim()) ? 0.55 : 1 }}>{pending ? '…' : `✓ Record check · ${money(amtNum)}`}</button>
            </div>
          )}

          {/* Not paying on the spot? Send it to them — pay link or bank transfer (card-not-present). */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 8px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em' }}>or send it to them</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <button onClick={makeLink} disabled={pending || !valid || !stripeReady} className="btn btn-ghost" style={{ width: '100%', fontSize: 12.5, opacity: (pending || !valid || !stripeReady) ? 0.55 : 1 }}>
            {pending && mode === 'link' ? '…' : '✉️ Send a pay link (text / email)'}
          </button>
          <button onClick={makeAch} disabled={pending || !valid || !stripeReady} className="btn btn-ghost" style={{ width: '100%', marginTop: 8, fontSize: 12.5, opacity: (pending || !valid || !stripeReady) ? 0.55 : 1 }}>
            {pending && mode === 'ach' ? '…' : '🏦 Bank transfer (ACH)'}
          </button>
          <div className="muted" style={{ fontSize: 10.5, marginTop: 5, textAlign: 'center' }}>Bank transfer skips the card fee but is slower — only if a card won’t work.</div>
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

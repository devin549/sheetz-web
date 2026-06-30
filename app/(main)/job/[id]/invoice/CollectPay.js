'use client';

// Collect payment for THIS job — fires a Stripe pay-link (customer pays + card fee on a secure page).
import { useState, useTransition } from 'react';
import { createJobPayLink } from '../../../my-day/actions';
import { recordManualPayment } from '../checkoutActions';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fld = { flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 15 };

export default function CollectPay({ jobId, defaultAmount, tel }) {
  const [amt, setAmt] = useState(defaultAmount ? String(defaultAmount) : '');
  const [link, setLink] = useState(null);
  const [err, setErr] = useState(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkNo, setCheckNo] = useState('');
  const [checkId, setCheckId] = useState('');
  const [paid, setPaid] = useState(null); // { method, total, checkNumber }
  const [pending, start] = useTransition();
  const amtNum = Number(amt);
  const valid = amtNum > 0;
  const make = () => { setErr(null); start(async () => { const r = await createJobPayLink(jobId, amtNum); if (r.ok) setLink(r); else setErr(r.msg); }); };
  const takeCash = () => { setErr(null); start(async () => { const r = await recordManualPayment(jobId, { method: 'cash', amountDollars: amtNum }); if (r.ok) setPaid({ method: 'cash', total: r.totalDollars }); else setErr(r.msg); }); };
  const takeCheck = () => { setErr(null); if (!checkNo.trim() || !checkId.trim()) { setErr('Enter the check number and the ID written on the check.'); return; } start(async () => { const r = await recordManualPayment(jobId, { method: 'check', amountDollars: amtNum, checkNumber: checkNo, idOnCheck: checkId }); if (r.ok) setPaid({ method: 'check', total: r.totalDollars, checkNumber: r.checkNumber }); else setErr(r.msg); }); };

  if (paid) return (
    <div className="card" style={{ borderLeft: '3px solid var(--green)', marginTop: 10 }}>
      <div style={{ fontWeight: 800, color: 'var(--green)', fontSize: 15 }}>✅ Paid {money(paid.total)} · {paid.method === 'cash' ? 'cash' : `check #${paid.checkNumber}`}</div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{paid.method === 'cash' ? 'Marked “Paid · cash” — turn the cash in to the office.' : 'Marked “Paid · check” with the check number + ID on file.'}</div>
    </div>
  );

  return (
    <div className="card" style={{ borderLeft: '3px solid #635bff', marginTop: 10 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>💳 Collect payment</div>
      {!link ? (
        <>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>$</span>
            <input type="number" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0.00" style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 15 }} />
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Customer pays this. <strong>Card</strong> adds a 4% fee; <strong>cash &amp; check</strong> don’t.</div>

          {/* Cash + check up front — no fee. Check captures the check # + the ID written on it. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={takeCash} disabled={pending || !valid} className="btn btn-ghost" style={{ flex: 1, opacity: (pending || !valid) ? 0.55 : 1 }}>💵 Cash</button>
            <button onClick={() => setCheckOpen((v) => !v)} disabled={!valid} className="btn btn-ghost" style={{ flex: 1, opacity: !valid ? 0.55 : 1, borderColor: checkOpen ? 'var(--amber)' : undefined, color: checkOpen ? 'var(--amber)' : undefined }}>🧾 Check</button>
          </div>
          {checkOpen && (
            <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--amber-dim)', display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 11, color: 'var(--fg-2)' }}>Check number
                <input value={checkNo} onChange={(e) => setCheckNo(e.target.value)} inputMode="numeric" placeholder="e.g. 1042" style={{ ...fld, width: '100%', marginTop: 3 }} />
              </label>
              <label style={{ fontSize: 11, color: 'var(--fg-2)' }}>ID written on the check (driver’s license #)
                <input value={checkId} onChange={(e) => setCheckId(e.target.value)} placeholder="DL # the customer wrote on it" style={{ ...fld, width: '100%', marginTop: 3 }} />
              </label>
              <div className="muted" style={{ fontSize: 10.5 }}>CB policy: write the customer’s ID on every check before accepting it.</div>
              <button onClick={takeCheck} disabled={pending || !valid || !checkNo.trim() || !checkId.trim()} className="btn" style={{ opacity: (pending || !valid || !checkNo.trim() || !checkId.trim()) ? 0.55 : 1 }}>{pending ? '…' : `✓ Record check · ${money(amtNum)}`}</button>
            </div>
          )}

          {/* Not on the spot? Send a card pay link instead. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 8px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em' }}>or send it to them</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <button onClick={make} disabled={pending || !valid} className="btn btn-ghost" style={{ width: '100%', fontSize: 12.5, opacity: (pending || !valid) ? 0.55 : 1 }}>{pending ? '…' : '✉️ Send a pay link (card)'}</button>
          {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{err}</div>}
        </>
      ) : (
        <>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--purple)', marginBottom: 6 }}>Ready — customer pays {money(link.totalDollars)} ({money(link.baseDollars)} + {money(link.feeDollars)} fee)</div>
          <input readOnly value={link.url} onFocus={(e) => e.target.select()} style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {tel && <a href={`sms:${tel}?body=${encodeURIComponent('Pay your Clog Busterz invoice here: ' + link.url)}`} className="btn" style={{ flex: 1, textAlign: 'center', minWidth: 120, textDecoration: 'none' }}>✉️ Text customer</a>}
            <a href={link.url} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Open ↗</a>
          </div>
        </>
      )}
    </div>
  );
}

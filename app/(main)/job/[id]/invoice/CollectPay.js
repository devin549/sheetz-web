'use client';

// Collect payment for THIS job — fires a Stripe pay-link (customer pays + card fee on a secure page).
import { useState, useRef, useTransition } from 'react';
import { createJobPayLink } from '../../../my-day/actions';
import { recordManualPayment } from '../checkoutActions';

const money = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fld = { flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 15 };

function fileToScaledDataUrl(file, max = 1300) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); resolve(c.toDataURL('image/jpeg', 0.85)); };
    img.onerror = () => resolve(null);
    const fr = new FileReader(); fr.onload = () => { img.src = fr.result; }; fr.readAsDataURL(file);
  });
}

export default function CollectPay({ jobId, defaultAmount, tel }) {
  const [amt, setAmt] = useState(defaultAmount ? String(defaultAmount) : '');
  const [link, setLink] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('cash');
  const [checkNo, setCheckNo] = useState('');
  const [checkId, setCheckId] = useState('');
  const [cashPhoto, setCashPhoto] = useState(null);
  const cashRef = useRef();
  const [paid, setPaid] = useState(null); // { method, total, checkNumber }
  const [pending, start] = useTransition();
  const amtNum = Number(amt);
  const valid = amtNum > 0;
  const make = () => { setErr(null); start(async () => { const r = await createJobPayLink(jobId, amtNum); if (r.ok) setLink(r); else setErr(r.msg); }); };
  const pickCash = async (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const url = await fileToScaledDataUrl(f); setCashPhoto(url); e.target.value = ''; };
  const takeCash = () => { setErr(null); if (!cashPhoto) { setErr('Take a photo of the cash fanned out first.'); return; } start(async () => { const r = await recordManualPayment(jobId, { method: 'cash', amountDollars: amtNum, cashPhoto }); if (r.ok) setPaid({ method: 'cash', total: r.totalDollars }); else setErr(r.msg); }); };
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

          {/* Method tabs — only the picked one's controls show (keeps it clean). */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {[['cash', '💵 Cash'], ['check', '🧾 Check'], ['link', '✉️ Link']].map(([id, label]) => {
              const on = tab === id;
              return <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: '8px 6px', borderRadius: 9, fontSize: 12.5, fontWeight: on ? 800 : 600, cursor: 'pointer', textAlign: 'center', background: on ? 'var(--amber)' : 'var(--surface-2)', color: on ? '#1a1206' : 'var(--fg-2)', border: '1px solid ' + (on ? 'var(--amber)' : 'var(--border)') }}>{label}</button>;
            })}
          </div>
          <div style={{ marginTop: 10 }}>
            {tab === 'cash' && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 11.5, color: 'var(--fg-2)', lineHeight: 1.45 }}>📸 <strong>Fan the bills out and snap a photo</strong> — proof of the cash collected. Goes to the office, not the customer.</div>
                <input ref={cashRef} type="file" accept="image/*" capture="environment" onChange={pickCash} style={{ display: 'none' }} />
                <button onClick={() => cashRef.current && cashRef.current.click()} className="btn btn-ghost" style={{ borderColor: cashPhoto ? 'var(--green)' : 'var(--purple)', color: cashPhoto ? 'var(--green)' : 'var(--purple)' }}>{cashPhoto ? '✓ Cash photo attached — retake' : '📷 Photo the cash (fanned out)'}</button>
                <button onClick={takeCash} disabled={pending || !valid || !cashPhoto} className="btn" style={{ opacity: (pending || !valid || !cashPhoto) ? 0.55 : 1 }}>{pending ? '…' : `✓ Record cash · ${money(amtNum)}`}</button>
              </div>
            )}
            {tab === 'check' && (
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--fg-2)' }}>Check number<input value={checkNo} onChange={(e) => setCheckNo(e.target.value)} inputMode="numeric" placeholder="e.g. 1042" style={{ ...fld, width: '100%', marginTop: 3 }} /></label>
                <label style={{ fontSize: 11, color: 'var(--fg-2)' }}>ID written on the check (driver’s license #)<input value={checkId} onChange={(e) => setCheckId(e.target.value)} placeholder="DL # the customer wrote on it" style={{ ...fld, width: '100%', marginTop: 3 }} /></label>
                <div className="muted" style={{ fontSize: 10.5 }}>CB policy: write the customer’s ID on every check before accepting it.</div>
                <button onClick={takeCheck} disabled={pending || !valid || !checkNo.trim() || !checkId.trim()} className="btn" style={{ opacity: (pending || !valid || !checkNo.trim() || !checkId.trim()) ? 0.55 : 1 }}>{pending ? '…' : `✓ Record check · ${money(amtNum)}`}</button>
              </div>
            )}
            {tab === 'link' && (<>
              <button onClick={make} disabled={pending || !valid} className="btn" style={{ width: '100%', opacity: (pending || !valid) ? 0.55 : 1 }}>{pending ? '…' : '✉️ Send a pay link (card)'}</button>
              <div className="muted" style={{ fontSize: 10.5, marginTop: 6, textAlign: 'center' }}>Customer pays on a secure Stripe page (+4% card fee).</div>
            </>)}
          </div>
          {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{err}</div>}
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

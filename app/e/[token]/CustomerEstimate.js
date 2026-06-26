'use client';

import { useState, useTransition } from 'react';
import { approveEstimate, askQuestion, requestDeposit, declineEstimate } from './actions';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const AMBER = '#ffb300', GREEN = '#3fb56a', SURF = '#171922', SURF2 = '#1f2230', LINE = '#2c3040';

export default function CustomerEstimate({ est }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(est.status);
  const [view, setView] = useState(null);    // 'question' | 'decline' | 'approve'
  const [text, setText] = useState('');
  const [done, setDone] = useState(null);
  const [name, setName] = useState(est.customerName || '');
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState(null);

  const act = (fn, arg) => start(async () => { setErr(null); const r = await fn(est.token, arg); if (r.ok) { setDone(r.msg); setStatus('done'); } else setErr(r.msg); });
  const approve = () => { if (!name.trim()) { setErr('Please type your name to approve.'); return; } if (!consent) { setErr('Please check the box to authorize the work.'); return; } act(approveEstimate, { name: name.trim(), consent: true }); };

  const closed = ['approved', 'declined', 'deposit_requested', 'question'].includes(status) || status === 'done';
  const total = est.subtotal + est.cardFee;

  const card = { background: SURF, border: `1px solid ${LINE}`, borderRadius: 16, padding: 18, width: '100%', maxWidth: 480, boxSizing: 'border-box' };
  const btn = (bg, color, border) => ({ width: '100%', padding: '15px', borderRadius: 12, border: border || 'none', background: bg, color, fontSize: 16, fontWeight: 800, cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.7 : 1 });

  return (
    <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Brand header */}
      <div style={{ textAlign: 'center', marginTop: 6 }}>
        <div style={{ fontSize: 13, letterSpacing: '.18em', color: AMBER, fontWeight: 800 }}>CLOG BUSTERZ PLUMBING</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{est.headline || 'Your options'}{est.customerName ? <span style={{ opacity: 0.6, fontWeight: 500 }}> · {est.customerName}</span> : ''}</div>
        {est.customerDescription && <p style={{ opacity: 0.72, fontSize: 14, lineHeight: 1.5, margin: '8px 0 0' }}>{est.customerDescription}</p>}
      </div>

      {/* Line cards — picture-forward */}
      {est.lines.map((l, i) => (
        <div key={i} style={card}>
          {l.photo ? (
            <img src={l.photo} alt={l.name} style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 12, marginBottom: 12, background: SURF2 }} />
          ) : (
            <div style={{ width: '100%', height: 110, borderRadius: 12, marginBottom: 12, background: SURF2, display: 'grid', placeItems: 'center', fontSize: 34, opacity: 0.5 }}>🔧</div>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 17, flex: 1 }}>{l.name}</div>
            <div style={{ fontWeight: 800, fontSize: 18, color: AMBER }}>{money(l.price)}</div>
          </div>
          {l.description && <p style={{ opacity: 0.72, fontSize: 13.5, lineHeight: 1.5, margin: '6px 0 0' }}>{l.description}</p>}
          {l.gallery && l.gallery.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto' }}>
              {l.gallery.slice(0, 6).map((g, gi) => <img key={gi} src={g} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />)}
            </div>
          )}
          {l.warranty && <div style={{ fontSize: 12, opacity: 0.65, marginTop: 10 }}>🛡 {l.warranty}</div>}
          {l.pdf && <a href={l.pdf} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: AMBER, display: 'inline-block', marginTop: 8, textDecoration: 'none' }}>📄 Product details →</a>}
        </div>
      ))}

      {/* Total */}
      <div style={{ ...card, background: SURF2 }}>
        {est.lines.length > 1 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, opacity: 0.8 }}><span>Subtotal</span><span>{money(est.subtotal)}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: est.lines.length > 1 ? 8 : 0 }}>
          <span style={{ fontWeight: 800, fontSize: 18 }}>Total</span>
          <span style={{ fontWeight: 800, fontSize: 26, color: AMBER }}>{money(est.subtotal)}</span>
        </div>
        {est.warranty && <div style={{ fontSize: 12, opacity: 0.65, marginTop: 10 }}>🛡 {est.warranty}</div>}
      </div>

      {/* Actions OR closed state */}
      {done ? (
        <div style={{ ...card, textAlign: 'center', borderColor: GREEN }}>
          <div style={{ fontSize: 34 }}>{status === 'done' ? '✅' : '👍'}</div>
          <div style={{ fontWeight: 700, marginTop: 6 }}>{done}</div>
          {est.techName && <div style={{ opacity: 0.6, fontSize: 13, marginTop: 4 }}>— {est.techName}, Clog Busterz</div>}
        </div>
      ) : status === 'approved' ? (
        <div style={{ ...card, borderColor: GREEN }}>
          <div style={{ textAlign: 'center', fontSize: 34 }}>✅</div>
          <div style={{ textAlign: 'center', fontWeight: 800, marginTop: 4 }}>Approved — thank you!</div>
          {est.approvedName && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: SURF2, fontSize: 12.5, lineHeight: 1.6 }}>
              <div style={{ opacity: 0.55, textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 10, marginBottom: 4 }}>Approval on record</div>
              <div><strong>{est.approvedName}</strong> · {money(est.subtotal)}</div>
              {est.approvedAt && <div style={{ opacity: 0.7 }}>{new Date(est.approvedAt).toLocaleString()}</div>}
              {est.consentText && <div style={{ opacity: 0.7, marginTop: 6, fontStyle: 'italic' }}>“{est.consentText}”</div>}
            </div>
          )}
        </div>
      ) : closed ? (
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ opacity: 0.8 }}>{status === 'declined' ? 'This estimate was declined.' : 'Thanks — we’ll be in touch.'}</div>
        </div>
      ) : view === 'approve' ? (
        <div style={{ ...card, borderColor: GREEN }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Approve {money(est.subtotal)}</div>
          <p style={{ opacity: 0.72, fontSize: 13, margin: '0 0 12px' }}>Type your name to authorize the work. This is your record of approval.</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" autoFocus
            style={{ width: '100%', boxSizing: 'border-box', background: SURF2, border: `1px solid ${LINE}`, color: '#fff', borderRadius: 10, padding: 13, fontSize: 16, marginBottom: 12 }} />
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5, opacity: 0.9, cursor: 'pointer', marginBottom: 14 }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }} />
            <span>I, <strong>{name.trim() || 'the customer'}</strong>, approve this {money(est.subtotal)} estimate from Clog Busterz Plumbing and authorize the work described.</span>
          </label>
          {err && <div style={{ color: '#ff8a8a', fontSize: 13, marginBottom: 10 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setView(null); setErr(null); }} style={btn(SURF2, '#fff')}>Back</button>
            <button onClick={approve} disabled={pending} style={btn(GREEN, '#06210f')}>{pending ? '…' : '✓ Approve & Schedule'}</button>
          </div>
        </div>
      ) : view === 'question' ? (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Ask a question</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="What would you like to know?" style={{ width: '100%', boxSizing: 'border-box', background: SURF2, border: `1px solid ${LINE}`, color: '#fff', borderRadius: 10, padding: 11, fontSize: 15, fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => setView(null)} style={btn(SURF2, '#fff')}>Back</button>
            <button onClick={() => act(askQuestion, text)} disabled={pending} style={btn(AMBER, '#1a1a1a')}>Send</button>
          </div>
        </div>
      ) : view === 'decline' ? (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>No problem — mind sharing why?</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {['Too expensive', 'Need to think about it', 'Want a second opinion', 'Timing isn’t right'].map((r) => (
              <button key={r} onClick={() => act(declineEstimate, r)} disabled={pending} style={{ ...btn(SURF2, '#fff', `1px solid ${LINE}`), padding: 12, fontSize: 14, fontWeight: 600, textAlign: 'left' }}>{r}</button>
            ))}
          </div>
          <button onClick={() => setView(null)} style={{ ...btn('transparent', '#9aa', 'none'), marginTop: 8, fontSize: 14 }}>Back</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <button onClick={() => { setView('approve'); setErr(null); }} disabled={pending} style={btn(GREEN, '#06210f')}>✓ {est.approveText}</button>
          <button onClick={() => act(requestDeposit)} disabled={pending} style={btn(SURF, AMBER, `1px solid ${AMBER}`)}>💳 Put a deposit down</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setView('question')} disabled={pending} style={btn(SURF, '#fff', `1px solid ${LINE}`)}>Ask a question</button>
            <button onClick={() => setView('decline')} disabled={pending} style={btn(SURF, '#9aa', `1px solid ${LINE}`)}>Not now</button>
          </div>
          {err && <div style={{ color: '#ff8a8a', fontSize: 13, textAlign: 'center' }}>{err}</div>}
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: 11.5, opacity: 0.45, marginTop: 4, paddingBottom: 20 }}>
        Clog Busterz Plumbing · (859) 408-3382 · Prices held for this visit. Nothing is charged until you approve.
      </div>
    </div>
  );
}

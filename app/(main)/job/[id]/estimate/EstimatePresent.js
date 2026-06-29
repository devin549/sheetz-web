'use client';

// 🧾 Present surface — lives on the Estimate tab (the Pricebook builds + hands off here). Given the latest
// estimate, the tech sends it (Text / Email / View on this iPad), watches the customer respond live, and can
// mark it sold in person. All the estimate finalization happens HERE; the pricebook is just the builder.
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendEstimateText, sendEstimateEmail, markPresented, getEstimateStatus, logManualApproval } from '../pricebook/estimateActions';

const money = (n) => '$' + (Number(n) || 0).toLocaleString();
const STATUS = {
  sent: { label: 'Sent — waiting', color: 'var(--amber)' },
  viewed: { label: '👀 Customer is viewing', color: 'var(--amber)' },
  approved: { label: '✅ Approved', color: 'var(--green)' },
  declined: { label: '🙅 Declined', color: 'var(--red)' },
};

export default function EstimatePresent({ jobId, estimate }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sendMsg, setSendMsg] = useState(null);
  const [live, setLive] = useState(null);     // { status, terminal, approvedName }
  const [copied, setCopied] = useState(false);
  const [soldOpen, setSoldOpen] = useState(false);
  const [soldName, setSoldName] = useState('');

  const token = estimate?.token || null;
  const link = token && typeof window !== 'undefined' ? `${window.location.origin}/e/${token}` : '';
  const status = (live?.status) || estimate?.status || 'sent';
  const terminal = ['approved', 'declined'].includes(status);
  const st = STATUS[status] || STATUS.sent;

  // Live mirror — poll what the customer does on any channel (text/email/iPad) until terminal.
  useEffect(() => {
    if (!token || terminal) return;
    let alive = true;
    const tick = async () => { try { const s = await getEstimateStatus(token); if (alive && s?.ok) setLive(s); } catch (_) {} };
    tick();
    const i = setInterval(tick, 10000);
    return () => { alive = false; clearInterval(i); };
  }, [token, terminal]);

  if (!token) return null;

  const sendText = () => start(async () => { setSendMsg(null); const r = await sendEstimateText(token); setSendMsg({ ok: r.ok, text: r.msg }); });
  const sendEmail = () => start(async () => { setSendMsg(null); const r = await sendEstimateEmail(token); setSendMsg({ ok: r.ok, text: r.msg }); });
  const viewHere = () => start(async () => { setSendMsg(null); const r = await markPresented(token); if (r.ok && typeof window !== 'undefined') window.open(r.url, '_blank'); setSendMsg(r.ok ? { ok: true, text: 'Opened here — turn the iPad to the customer.' } : { ok: false, text: r.msg }); });
  const copy = () => { if (!link) return; navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };
  const markSold = () => start(async () => {
    const r = await logManualApproval(token, { name: soldName.trim() || 'Customer', method: 'in_person' });
    setSendMsg({ ok: r.ok, text: r.ok ? 'Recorded sold — counts as approved.' : r.msg });
    if (r.ok) { setSoldOpen(false); router.refresh(); }
  });

  return (
    <div className="card card-amber" style={{ marginTop: 10, borderColor: 'var(--amber)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800 }}>🧾 {estimate.headline || 'Estimate'}</span>
        {estimate.subtotal ? <span style={{ color: 'var(--amber)', fontWeight: 800 }}>{money(estimate.subtotal)}</span> : null}
        <span className="pill" style={{ marginLeft: 'auto', color: st.color, border: `1px solid ${st.color}`, fontWeight: 800, fontSize: 11 }}>{st.label}{status === 'approved' && (live?.approvedName || estimate.approved_name) ? ` · ${live?.approvedName || estimate.approved_name}` : ''}</span>
      </div>

      {!terminal ? (
        <>
          <div className="muted" style={{ fontSize: 12, margin: '8px 0 6px' }}>Send it to the customer — they see the Good/Better/Best and pick:</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button onClick={sendText} disabled={pending} className="btn" style={{ background: 'var(--green)', borderColor: 'var(--green)', color: '#06210f', fontSize: 13, padding: '10px' }}>💬 Text the link</button>
            <button onClick={sendEmail} disabled={pending} className="btn" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--fg-1)', fontSize: 13, padding: '10px' }}>📧 Email it</button>
          </div>
          <button onClick={viewHere} disabled={pending} className="btn" style={{ width: '100%', background: 'var(--amber)', borderColor: 'var(--amber)', color: '#1a1a1a', fontSize: 13, padding: '10px', marginTop: 6 }}>📱 View on this iPad (turn it around)</button>

          {sendMsg && <div style={{ fontSize: 11.5, marginTop: 8, color: sendMsg.ok ? 'var(--green)' : 'var(--red)' }}>{sendMsg.ok ? '✓ ' : '⚠ '}{sendMsg.text}</div>}

          {link && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: 'var(--amber)', wordBreak: 'break-all', flex: 1, minWidth: 0 }}>{link}</span>
              <button onClick={copy} className="pill" style={{ cursor: 'pointer' }}>{copied ? '✓ Copied' : '🔗 Copy'}</button>
              <a href={link} target="_blank" rel="noreferrer" className="pill" style={{ color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>↗ Open</a>
            </div>
          )}

          {/* Sold in person — verbal/at-the-door yes. Logs as a witnessed approval (same proof as a tapped one). */}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10 }}>
            {!soldOpen ? (
              <button onClick={() => setSoldOpen(true)} className="pill" style={{ cursor: 'pointer', color: 'var(--green)', display: 'inline-flex' }}>✓ They said yes in person — record sold</button>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={soldName} onChange={(e) => setSoldName(e.target.value)} placeholder="Who approved it? (name)"
                  style={{ flex: 1, minWidth: 140, background: 'var(--surface-2)', border: '1px solid ' + (soldName.trim() ? 'var(--border)' : 'var(--amber-dim)'), color: 'var(--fg-1)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
                <button onClick={markSold} disabled={pending || !soldName.trim()} className="btn" style={{ background: 'var(--green)', borderColor: 'var(--green)', color: '#06210f', fontSize: 12.5, padding: '8px 12px', opacity: (pending || !soldName.trim()) ? 0.6 : 1 }}>Mark sold</button>
                <button onClick={() => setSoldOpen(false)} className="pill" style={{ cursor: 'pointer', color: 'var(--fg-3)' }}>✕</button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          {status === 'approved' ? `Approved${(live?.approvedName || estimate.approved_name) ? ` by ${live?.approvedName || estimate.approved_name}` : ''}. See the proof below.` : 'Customer declined — see the proof below. Build a new option in the Pricebook if needed.'}
        </div>
      )}
    </div>
  );
}

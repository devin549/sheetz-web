'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { logContact, logCertified, attachDeliveryProof, getCustomerContacts } from './actions';

// Dunning ladder → next action by age (ported from the Accounting Sheet AR cascade).
function nextActionFor(days) {
  if (days == null || days <= 30) return { stage: 'Friendly reminder', lien: false };
  if (days <= 60) return { stage: 'Past-due notice', lien: false };
  if (days <= 90) return { stage: 'Second notice + call', lien: false };
  if (days <= 180) return { stage: 'FINAL notice + certified letter · lien prep', lien: true };
  return { stage: '→ Lawyer packet (Fore / McKinstry) · lien window closing', lien: true };
}
const ICON = { text: '📱', email: '✉️', call: '📞', letter: '📨', certified: '📜', packet: '⚖️' };
// Exact timestamp — this is a legal evidence trail, so absolute date+time, not "0m ago".
function stamp(iso) { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } }
function dial(raw) { const d = String(raw || '').replace(/[^\d]/g, ''); if (d.length === 10) return '+1' + d; if (d.length === 11 && d[0] === '1') return '+' + d; return d ? '+' + d : ''; }
const pill = { cursor: 'pointer', fontSize: 11, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--fg-2)', textDecoration: 'none' };

// Per-certified-entry: upload the scanned return receipt (green card) → proof of delivery.
function DeliveryProof({ rawId, proofUrl, deliveredAt, onDone }) {
  const fileRef = useRef(null);
  const [date, setDate] = useState(deliveredAt || '');
  const [busy, start] = useTransition();
  const [err, setErr] = useState(null);

  const upload = () => {
    const f = fileRef.current?.files?.[0];
    if (!f) { setErr('Pick a scan or photo first.'); return; }
    setErr(null);
    const fd = new FormData();
    fd.append('logId', rawId); fd.append('file', f); if (date) fd.append('deliveredAt', date);
    start(async () => { const r = await attachDeliveryProof(fd); if (r?.ok) onDone(); else setErr(r?.msg); });
  };

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 3 }}>
      {proofUrl
        ? <a href={proofUrl} target="_blank" rel="noopener" className="pill" style={{ ...pill, color: 'var(--green)', borderColor: 'var(--green)' }}>📄 View signed receipt{deliveredAt ? ` · delivered ${deliveredAt}` : ''}</a>
        : <span className="muted" style={{ fontSize: 11 }}>No delivery proof yet.</span>}
      <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ fontSize: 11, maxWidth: 168 }} />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} title="Delivered date" style={{ ...pill, padding: '3px 6px', cursor: 'text' }} />
      <button onClick={upload} disabled={busy} className="pill" style={{ ...pill, fontWeight: 700 }}>{busy ? 'Uploading…' : (proofUrl ? '📎 Replace' : '📎 Attach receipt scan')}</button>
      {err && <span style={{ color: 'var(--red)', fontSize: 11 }}>{err}</span>}
    </div>
  );
}

export default function CollectionsTimeline({ customerId, oldestDays, address, phone, email, canLog }) {
  const [contacts, setContacts] = useState(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);
  const [certOpen, setCertOpen] = useState(false);
  const [tracking, setTracking] = useState('');

  const load = () => getCustomerContacts(customerId).then((r) => { if (r?.ok) setContacts(r.contacts); else setErr(r?.msg); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [customerId]);

  const na = nextActionFor(oldestDays);
  const logIt = (channel) => { setErr(null); start(async () => { const r = await logContact(customerId, channel); if (r?.ok) load(); else setErr(r?.msg); }); };
  const sendCertified = () => { setErr(null); start(async () => { const r = await logCertified(customerId, tracking); if (r?.ok) { setTracking(''); setCertOpen(false); load(); } else setErr(r?.msg); }); };

  const tel = dial(phone);
  const STEPS = [
    { ch: 'text', lbl: '📱 Text', href: tel ? `sms:${tel}` : null },
    { ch: 'email', lbl: '✉️ Email', href: email ? `mailto:${email}` : null },
    { ch: 'call', lbl: '📞 Call', href: tel ? `tel:${tel}` : null },
  ];

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      {address && <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>📍 {address} <span style={{ marginLeft: 4 }}>· send invoice / statement here</span></div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="pill" style={{ fontSize: 11, background: na.lien ? 'rgba(239,83,80,.16)' : 'var(--surface-2)', color: na.lien ? 'var(--red)' : 'var(--fg-2)', fontWeight: 700 }}>Next: {na.stage}</span>
        {canLog && (
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {STEPS.map((s) => (s.href
              ? <a key={s.ch} href={s.href} onClick={() => logIt(s.ch)} className="pill" style={pill} title="Opens your phone / mail and logs the attempt">{s.lbl}</a>
              : <button key={s.ch} onClick={() => logIt(s.ch)} disabled={pending} className="pill" style={pill}>{s.lbl}</button>
            ))}
            <a href={`/past-due/statement/${customerId}`} target="_blank" rel="noopener" className="pill" style={pill} title="Customer statement of account (print / email PDF)">📄 Statement</a>
            <a href={`/past-due/letter/${customerId}`} target="_blank" rel="noopener" className="pill" style={pill} title="Generate the certified demand letter (print → mail)">📄 Certified letter</a>
            <button onClick={() => setCertOpen((v) => !v)} disabled={pending} className="pill" style={pill}>📜 Log certified</button>
            <a href={`/pete?customer=${customerId}&purpose=collections`} className="pill" style={{ ...pill, fontWeight: 700 }}>📞 Call with Pete</a>
            <a href={`/past-due/packet/${customerId}`} target="_blank" rel="noopener" onClick={() => logIt('packet')} className="pill"
              style={{ ...pill, fontWeight: 800, border: na.lien ? '1px solid var(--red)' : '1px solid var(--border-strong)', background: na.lien ? 'rgba(239,83,80,.14)' : 'transparent', color: na.lien ? 'var(--red)' : 'var(--fg-2)' }}>
              ⚖️ Build lawyer packet
            </a>
          </span>
        )}
      </div>

      {certOpen && canLog && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 8px' }}>
          <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="USPS tracking # (optional)" style={{ ...pill, padding: '6px 9px', cursor: 'text', minWidth: 220 }} />
          <button onClick={sendCertified} disabled={pending} className="pill" style={{ ...pill, fontWeight: 700 }}>{pending ? '…' : 'Log certified mail'}</button>
          <span className="muted" style={{ fontSize: 11 }}>Then attach the signed green card below when it comes back.</span>
        </div>
      )}
      {err && <div style={{ color: 'var(--red)', fontSize: 11, marginBottom: 6 }}>{err}</div>}

      <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Collections timeline</div>
      {contacts == null && <div className="muted" style={{ fontSize: 11 }}>Loading…</div>}
      {contacts != null && !contacts.length && <div className="muted" style={{ fontSize: 11 }}>No contact logged yet — start the cascade with a reminder above.</div>}
      {(contacts || []).map((c) => (
        <div key={c.id} style={{ padding: '4px 0', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ minWidth: 0 }}>
              {c.kind === 'call'
                ? <>📞 Pete call{c.status ? ` · ${c.status}` : ''}{c.duration_s ? ` · ${c.duration_s}s` : ''}{c.note ? ` · ${c.note}` : (c.ended_reason ? ` · ${c.ended_reason}` : '')}
                    {c.recording_url ? <> · <a href={c.recording_url} target="_blank" rel="noopener" style={{ fontWeight: 700 }}>▶️ recording</a></> : null}</>
                : <>{ICON[c.channel] || '•'} {c.channel}{c.note ? ` · ${c.note}` : ''}</>}
            </span>
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>{c.by_email ? c.by_email.split('@')[0] + ' · ' : ''}{stamp(c.created_at)}</span>
          </div>
          {c.kind === 'log' && c.channel === 'certified' && canLog && (
            <DeliveryProof rawId={c.rawId} proofUrl={c.proof_url} deliveredAt={c.delivered_at} onDone={load} />
          )}
        </div>
      ))}
    </div>
  );
}

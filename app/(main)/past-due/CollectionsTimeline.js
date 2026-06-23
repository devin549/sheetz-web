'use client';

import { useEffect, useState, useTransition } from 'react';
import { logContact, getCustomerContacts } from './actions';

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
// Phone → tel/sms target. 10-digit US → +1….
function dial(raw) { const d = String(raw || '').replace(/[^\d]/g, ''); if (d.length === 10) return '+1' + d; if (d.length === 11 && d[0] === '1') return '+' + d; return d ? '+' + d : ''; }

export default function CollectionsTimeline({ customerId, oldestDays, address, phone, email, canLog }) {
  const [contacts, setContacts] = useState(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);

  const load = () => getCustomerContacts(customerId).then((r) => { if (r?.ok) setContacts(r.contacts); else setErr(r?.msg); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [customerId]);

  const na = nextActionFor(oldestDays);
  const logIt = (channel) => { setErr(null); start(async () => { const r = await logContact(customerId, channel); if (r?.ok) load(); else setErr(r?.msg); }); };

  const tel = dial(phone);
  // Each step can both LAUNCH the contact (opens your own phone/mail — no auto-send) AND log a
  // timestamped attempt. Certified is physical, so it only logs.
  const STEPS = [
    { ch: 'text', lbl: '📱 Text', href: tel ? `sms:${tel}` : null },
    { ch: 'email', lbl: '✉️ Email', href: email ? `mailto:${email}` : null },
    { ch: 'call', lbl: '📞 Call', href: tel ? `tel:${tel}` : null },
    { ch: 'certified', lbl: '📜 Certified', href: null },
  ];
  const pill = { cursor: 'pointer', fontSize: 11, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--fg-2)', textDecoration: 'none' };

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
            <a href={`/pete?customer=${customerId}&purpose=collections`} className="pill" style={{ ...pill, fontWeight: 700 }}>📞 Call with Pete</a>
            <a href={`/past-due/packet/${customerId}`} target="_blank" rel="noopener" onClick={() => logIt('packet')} className="pill"
              style={{ ...pill, fontWeight: 800, border: na.lien ? '1px solid var(--red)' : '1px solid var(--border-strong)', background: na.lien ? 'rgba(239,83,80,.14)' : 'transparent', color: na.lien ? 'var(--red)' : 'var(--fg-2)' }}>
              ⚖️ Build lawyer packet
            </a>
          </span>
        )}
      </div>
      {err && <div style={{ color: 'var(--red)', fontSize: 11, marginBottom: 6 }}>{err}</div>}

      <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Collections timeline</div>
      {contacts == null && <div className="muted" style={{ fontSize: 11 }}>Loading…</div>}
      {contacts != null && !contacts.length && <div className="muted" style={{ fontSize: 11 }}>No contact logged yet — start the cascade with a reminder above.</div>}
      {(contacts || []).map((c) => (
        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
          <span style={{ minWidth: 0 }}>
            {c.kind === 'call'
              ? <>📞 Pete call{c.status ? ` · ${c.status}` : ''}{c.duration_s ? ` · ${c.duration_s}s` : ''}{c.note ? ` · ${c.note}` : (c.ended_reason ? ` · ${c.ended_reason}` : '')}
                  {c.recording_url ? <> · <a href={c.recording_url} target="_blank" rel="noopener" style={{ fontWeight: 700 }}>▶️ recording</a></> : null}</>
              : <>{ICON[c.channel] || '•'} {c.channel}{c.note ? ` · ${c.note}` : ''}</>}
          </span>
          <span className="muted" style={{ whiteSpace: 'nowrap' }}>{c.by_email ? c.by_email.split('@')[0] + ' · ' : ''}{stamp(c.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

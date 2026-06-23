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
const STEPS = [['text', '📱 Text'], ['email', '✉️ Email'], ['call', '📞 Call'], ['certified', '📜 Certified'], ['packet', '⚖️ Lawyer packet']];
function ago(iso) { try { const m = (Date.now() - new Date(iso).getTime()) / 60000; if (m < 60) return Math.floor(m) + 'm ago'; if (m < 1440) return Math.floor(m / 60) + 'h ago'; return Math.floor(m / 1440) + 'd ago'; } catch { return ''; } }

export default function CollectionsTimeline({ customerId, oldestDays, address, canLog }) {
  const [contacts, setContacts] = useState(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState(null);

  const load = () => getCustomerContacts(customerId).then((r) => { if (r?.ok) setContacts(r.contacts); else setErr(r?.msg); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [customerId]);

  const na = nextActionFor(oldestDays);
  const logIt = (channel) => { setErr(null); start(async () => { const r = await logContact(customerId, channel); if (r?.ok) load(); else setErr(r?.msg); }); };

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      {address && <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>📍 {address} <span style={{ marginLeft: 4 }}>· send invoice / statement here</span></div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="pill" style={{ fontSize: 11, background: na.lien ? 'rgba(239,83,80,.16)' : 'var(--surface-2)', color: na.lien ? 'var(--red)' : 'var(--fg-2)', fontWeight: 700 }}>Next: {na.stage}</span>
        {canLog && (
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {STEPS.map(([ch, lbl]) => (
              <button key={ch} onClick={() => logIt(ch)} disabled={pending} className="pill" style={{ cursor: 'pointer', fontSize: 11, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--fg-2)' }}>{lbl}</button>
            ))}
          </span>
        )}
      </div>
      {err && <div style={{ color: 'var(--red)', fontSize: 11, marginBottom: 6 }}>{err}</div>}

      <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Collections timeline</div>
      {contacts == null && <div className="muted" style={{ fontSize: 11 }}>Loading…</div>}
      {contacts != null && !contacts.length && <div className="muted" style={{ fontSize: 11 }}>No contact logged yet — start the cascade with a reminder above.</div>}
      {(contacts || []).map((c) => (
        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', fontSize: 12 }}>
          <span>{ICON[c.channel] || '•'} {c.channel}{c.note ? ` · ${c.note}` : ''}</span>
          <span className="muted" style={{ whiteSpace: 'nowrap' }}>{c.by_email ? c.by_email.split('@')[0] + ' · ' : ''}{ago(c.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveAndSend, cancelCampaign, sendTestToMe } from './actions';
import { personName } from '@/lib/people';

const STATUS = {
  pending_approval: { t: 'Pending approval', c: 'var(--amber)', bg: 'rgba(255,129,36,.14)' },
  approved: { t: 'Approved · not sent', c: 'var(--info-text)', bg: 'rgba(100,181,246,.14)' },
  sending: { t: 'Sending…', c: 'var(--info-text)', bg: 'rgba(100,181,246,.14)' },
  sent: { t: 'Sent', c: 'var(--green)', bg: 'rgba(76,175,80,.14)' },
  canceled: { t: 'Canceled', c: 'var(--fg-3)', bg: 'var(--surface-2)' },
};
function when(iso) { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } }

export default function CampaignList({ campaigns, canApprove, emailReady }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();

  const run = (id, fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(id); setMsg(null);
    start(async () => { const r = await fn(); setBusyId(null); setMsg({ id, bad: !r.ok, t: r.msg || (r.ok ? `Sent ${r.sent}, ${r.failed} failed.` : 'Done.') }); router.refresh(); });
  };

  if (!campaigns.length) return <div className="muted" style={{ fontSize: 13, margin: '14px 0' }}>No campaigns yet.</div>;

  return (
    <div style={{ marginTop: 14 }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Campaigns</div>
      {campaigns.map((c) => {
        const s = STATUS[c.status] || STATUS.canceled;
        const pendingState = ['pending_approval', 'approved'].includes(c.status);
        const releasable = canApprove && pendingState;
        const cancelable = pendingState;
        return (
          <div key={c.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.subject}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                {c.audience_label} · {c.recipient_count?.toLocaleString()} recipients{c.skipped_count ? ` · ${c.skipped_count} skipped` : ''}
                {c.created_by ? ` · by ${personName(c.created_by)}` : ''} · {when(c.created_at)}
                {c.status === 'sent' && <span style={{ color: 'var(--green)' }}> · ✅ {c.send_ok} sent{c.send_fail ? `, ⚠️ ${c.send_fail} failed` : ''}{c.approved_by ? ` · approved by ${personName(c.approved_by)}` : ''}</span>}
                {c.status === 'sent' && c.send_ok > 0 && <span style={{ color: 'var(--info-text)' }}> · 📭 {c.opened || 0} opened{c.send_ok ? ` (${Math.round(((c.opened || 0) / c.send_ok) * 100)}%)` : ''}</span>}
              </div>
            </div>
            <span className="pill" style={{ background: s.bg, color: s.c, fontWeight: 700 }}>{s.t}</span>
            {pendingState && (
              <button onClick={() => run(c.id, () => sendTestToMe(c.id))} disabled={pending}
                style={{ background: 'transparent', color: 'var(--info-text)', border: '1px solid var(--info-text)', borderRadius: 8, padding: '7px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: pending && busyId === c.id ? 0.6 : 1 }}>
                {pending && busyId === c.id ? '…' : '✉️ Test to me'}
              </button>
            )}
            {releasable && (
              <button onClick={() => run(c.id, () => approveAndSend(c.id), `Send "${c.subject}" to ${c.recipient_count} customers? This emails real people.`)} disabled={pending}
                style={{ background: 'var(--green)', color: '#fff', border: 0, borderRadius: 8, padding: '7px 13px', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: pending && busyId === c.id ? 0.6 : 1 }}>
                {pending && busyId === c.id ? 'Sending…' : (emailReady ? '✅ Approve & send' : '✅ Approve')}
              </button>
            )}
            {cancelable && (
              <button onClick={() => run(c.id, () => cancelCampaign(c.id), `Cancel "${c.subject}"?`)} disabled={pending}
                style={{ background: 'transparent', color: 'var(--fg-3)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 11px', fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
            )}
            {msg && msg.id === c.id && <div style={{ width: '100%', fontSize: 12, color: msg.bad ? 'var(--red)' : 'var(--green)', marginTop: 4 }}>{msg.t}</div>}
          </div>
        );
      })}
    </div>
  );
}

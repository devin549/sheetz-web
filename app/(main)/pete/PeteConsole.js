'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PURPOSES } from '@/lib/pete';
import { queueCall, approveAndCall, cancelCall } from './actions';

const ctrl = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 13, width: '100%' };
const lbl = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--fg-3)', margin: '12px 0 5px', display: 'block' };
const STATUS = {
  queued: { t: 'Queued · needs approval', c: 'var(--amber)', bg: 'rgba(255,129,36,.14)' },
  approved: { t: 'Approved · not dialed', c: 'var(--info-text)', bg: 'rgba(100,181,246,.14)' },
  calling: { t: 'Calling…', c: 'var(--info-text)', bg: 'rgba(100,181,246,.14)' },
  completed: { t: 'Completed', c: 'var(--green)', bg: 'rgba(76,175,80,.14)' },
  failed: { t: 'Failed', c: 'var(--red)', bg: 'rgba(239,83,80,.16)' },
  canceled: { t: 'Canceled', c: 'var(--fg-3)', bg: 'var(--surface-2)' },
};
function when(iso) { try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } }

export default function PeteConsole({ prefill, calls, canApprove, vapiReady, hasTestNumbers }) {
  const router = useRouter();
  const [name, setName] = useState(prefill.name || '');
  const [phone, setPhone] = useState(prefill.phone || '');
  const [purpose, setPurpose] = useState(prefill.purpose || 'collections');
  const [note, setNote] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const [rowMsg, setRowMsg] = useState(null);
  const [rowBusy, setRowBusy] = useState(null);

  const submit = () => {
    setMsg(null);
    start(async () => {
      const r = await queueCall({ customerId: prefill.customerId || null, toPhone: phone, name, purpose, scriptNote: note, testMode });
      setMsg({ bad: !r.ok, t: r.msg });
      if (r.ok) { setNote(''); if (!testMode) setPhone(''); router.refresh(); }
    });
  };
  const runRow = (id, fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setRowBusy(id); setRowMsg(null);
    start(async () => { const r = await fn(); setRowBusy(null); setRowMsg({ id, bad: !r.ok, t: r.msg || 'Done.' }); router.refresh(); });
  };

  return (
    <>
      {/* composer */}
      <div className="card card-amber">
        <div style={{ fontWeight: 800, fontSize: 15 }}>🪠 New Pete call</div>

        <label style={lbl}>Purpose</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PURPOSES.map((p) => (
            <button key={p.key} onClick={() => setPurpose(p.key)} className="pill" title={p.desc}
              style={{ cursor: 'pointer', fontSize: 12, background: purpose === p.key ? 'var(--accent)' : 'var(--surface-2)', color: purpose === p.key ? '#fff' : 'var(--fg-2)', fontWeight: purpose === p.key ? 800 : 600 }}>{p.label}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={lbl}>Customer name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={ctrl} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={lbl}>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(859) 555-0123" style={ctrl} />
          </div>
        </div>

        <label style={lbl}>What should Pete say? <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--fg-3)' }}>— context for the AI (optional)</span></label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. balance is 67 days past due, offer to split into 2 payments, be friendly" style={{ ...ctrl, fontFamily: 'var(--sans)', lineHeight: 1.5, resize: 'vertical' }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 0', fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
          <span>🔒 <strong>Test call</strong> — dial my own number first (must be on the <code>PETE_TEST_NUMBERS</code> allowlist)</span>
        </label>
        {testMode && !hasTestNumbers && <div className="muted" style={{ fontSize: 11.5, marginTop: 4, color: 'var(--amber)' }}>No <code>PETE_TEST_NUMBERS</code> set yet — add your cell there in Vercel to test safely.</div>}

        {msg && <div className="notice" style={{ marginTop: 10, color: msg.bad ? 'var(--red)' : 'var(--green)', borderColor: msg.bad ? 'var(--red)' : 'var(--green)' }}>{msg.t}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={submit} disabled={busy || !phone.trim()} className="btn" style={{ opacity: (busy || !phone.trim()) ? 0.55 : 1 }}>
            {busy ? 'Working…' : (testMode ? '📞 Place test call' : '📥 Queue for approval')}
          </button>
        </div>
      </div>

      {/* call log */}
      <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', margin: '16px 0 8px' }}>Recent calls</div>
      {!calls.length && <div className="muted" style={{ fontSize: 13 }}>No calls yet.</div>}
      {calls.map((c) => {
        const s = STATUS[c.status] || STATUS.canceled;
        const releasable = canApprove && ['queued', 'approved'].includes(c.status);
        const cancelable = ['queued', 'approved'].includes(c.status);
        return (
          <div key={c.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {c.customer_name || c.to_phone} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {c.purpose}{c.is_test ? ' · 🔒 test' : ''}</span>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                {c.to_phone}{c.requested_by ? ` · by ${c.requested_by.split('@')[0]}` : ''} · {when(c.created_at)}
                {c.duration_s ? ` · ${c.duration_s}s` : ''}{c.ended_reason ? ` · ${c.ended_reason}` : ''}
              </div>
              {c.summary && <div style={{ fontSize: 12.5, marginTop: 5, color: 'var(--fg-2)' }}>📝 {c.summary}</div>}
              {c.recording_url && <a href={c.recording_url} target="_blank" rel="noopener" style={{ fontSize: 12 }}>▶️ Recording</a>}
            </div>
            <span className="pill" style={{ background: s.bg, color: s.c, fontWeight: 700 }}>{s.t}</span>
            {releasable && (
              <button onClick={() => runRow(c.id, () => approveAndCall(c.id), `Have Pete call ${c.customer_name || c.to_phone} now? This dials a real customer.`)} disabled={busy}
                style={{ background: 'var(--green)', color: '#fff', border: 0, borderRadius: 8, padding: '7px 13px', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: busy && rowBusy === c.id ? 0.6 : 1 }}>
                {busy && rowBusy === c.id ? 'Calling…' : (vapiReady ? '📞 Approve & call' : '✅ Approve')}
              </button>
            )}
            {cancelable && (
              <button onClick={() => runRow(c.id, () => cancelCall(c.id), `Cancel this call?`)} disabled={busy}
                style={{ background: 'transparent', color: 'var(--fg-3)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 11px', fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
            )}
            {rowMsg && rowMsg.id === c.id && <div style={{ width: '100%', fontSize: 12, color: rowMsg.bad ? 'var(--red)' : 'var(--green)', marginTop: 4 }}>{rowMsg.t}</div>}
          </div>
        );
      })}
    </>
  );
}

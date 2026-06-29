'use client';

// ✍️ Final acceptance — the customer signs the completion-acceptance terms (drafted by counsel) when the
// work is done. "My signature signifies full and final acceptance of the work performed."
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import SignaturePad from '@/components/SignaturePad';
import { COMPLETION_ACCEPTANCE } from '@/lib/estimateTerms';
import { saveCompletionSignature } from './actions';

export default function CompletionSignature({ jobId, signedName, signedAt }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(signedName || '');
  const [sig, setSig] = useState(null);
  const [msg, setMsg] = useState(null);
  const save = () => {
    setMsg(null);
    if (!sig) { setMsg('Have the customer sign first.'); return; }
    start(async () => { const r = await saveCompletionSignature(jobId, { name, signature: sig }); setMsg(r.msg); if (r.ok) { setOpen(false); router.refresh(); } });
  };

  if (signedName && !open) {
    return (
      <div className="card" style={{ marginTop: 10, borderLeft: '3px solid var(--green)' }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>✍️ Final acceptance signed</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{signedName}{signedAt ? ` · ${new Date(signedAt).toLocaleDateString()}` : ''} — full and final acceptance on file.</div>
        <button onClick={() => setOpen(true)} className="pill" style={{ cursor: 'pointer', marginTop: 6, fontSize: 11 }}>Re-sign</button>
      </div>
    );
  }
  return (
    <div className="card" style={{ marginTop: 10, borderLeft: '3px solid var(--amber)' }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>✍️ Final acceptance — sign when work is complete</div>
      <div style={{ maxHeight: 160, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 11.5, lineHeight: 1.55, color: 'var(--fg-2)', whiteSpace: 'pre-wrap', marginBottom: 10 }}>{COMPLETION_ACCEPTANCE}</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14, marginBottom: 10 }} />
      <SignaturePad onChange={setSig} />
      {msg && <div style={{ fontSize: 12, marginTop: 6, color: msg.includes('signed') ? 'var(--green)' : 'var(--amber)' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {open && signedName && <button onClick={() => setOpen(false)} className="btn btn-ghost">Back</button>}
        <button onClick={save} disabled={pending} className="btn" style={{ opacity: pending ? 0.6 : 1 }}>{pending ? '…' : '💾 Save final acceptance'}</button>
      </div>
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveLegalTerms } from './actions';

const ta = { width: '100%', boxSizing: 'border-box', minHeight: 280, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 10, padding: 12, fontSize: 12.5, lineHeight: 1.5, fontFamily: 'inherit', whiteSpace: 'pre-wrap' };

function Block({ kind, title, sub, initial, version }) {
  const router = useRouter();
  const [text, setText] = useState(initial || '');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const dirty = text !== initial;
  const save = () => start(async () => { setMsg(null); const r = await saveLegalTerms(kind, text); setMsg(r); if (r.ok) router.refresh(); });

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontWeight: 800 }}>{title}</span>
        <span className="pill" style={{ marginLeft: 'auto', fontSize: 10 }}>{version}</span>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>{sub}</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} style={ta} spellCheck={false} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <button onClick={save} disabled={pending || !dirty} className="btn" style={{ opacity: (pending || !dirty) ? 0.55 : 1 }}>{pending ? 'Saving…' : dirty ? '💾 Save' : 'Saved'}</button>
        {msg && <span style={{ fontSize: 12, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
      </div>
    </div>
  );
}

export default function LegalTermsEditor({ auth, completion }) {
  return (
    <>
      <Block kind="work_authorization" title="Work Authorization & Terms" sub="Shown above the signature when a customer APPROVES an estimate (and on the printed invoice summary)." initial={auth.content} version={auth.version} />
      <Block kind="completion_acceptance" title="Completion Acceptance" sub="The FINAL signature at job completion — 'full and final acceptance of the work performed.'" initial={completion.content} version={completion.version} />
    </>
  );
}

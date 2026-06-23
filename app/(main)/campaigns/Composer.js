'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AUDIENCES } from '@/lib/campaigns';
import { previewAudience, draftCampaignAI, createCampaign } from './actions';

const ctrl = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 13, width: '100%' };
const lbl = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--fg-3)', margin: '12px 0 5px', display: 'block' };

export default function Composer({ canCompose }) {
  const router = useRouter();
  const [audience, setAudience] = useState('pastdue');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [brief, setBrief] = useState('');
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const [aiBusy, startAi] = useTransition();

  if (!canCompose) return null;

  const doPreview = () => { setMsg(null); start(async () => { const r = await previewAudience(audience); if (r.ok) setPreview(r); else { setPreview(null); setMsg({ bad: true, t: r.msg }); } }); };
  const doDraft = () => { setMsg(null); startAi(async () => { const r = await draftCampaignAI(audience, brief); if (r.ok) { setSubject(r.subject || subject); setBody(r.body); } else setMsg({ bad: true, t: r.msg }); }); };
  const doCreate = () => {
    setMsg(null);
    start(async () => {
      const r = await createCampaign({ subject, body, audience });
      if (r.ok) { setMsg({ bad: false, t: `Draft created for ${r.count} customer${r.count === 1 ? '' : 's'} (${r.skipped} skipped). It’s now waiting for an approver below.` }); setSubject(''); setBody(''); setPreview(null); router.refresh(); }
      else setMsg({ bad: true, t: r.msg });
    });
  };

  return (
    <div className="card card-amber" style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 15 }}>✍️ New campaign</div>

      <label style={lbl}>Audience</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {AUDIENCES.map((a) => (
          <button key={a.key} onClick={() => { setAudience(a.key); setPreview(null); }} className="pill" title={a.desc}
            style={{ cursor: 'pointer', fontSize: 12, background: audience === a.key ? 'var(--accent)' : 'var(--surface-2)', color: audience === a.key ? '#fff' : 'var(--fg-2)', fontWeight: audience === a.key ? 800 : 600 }}>{a.label}</button>
        ))}
        <button onClick={doPreview} disabled={busy} className="pill" style={{ cursor: 'pointer', fontSize: 12, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--fg-1)', fontWeight: 700 }}>{busy ? '…' : '👁️ Preview list'}</button>
      </div>

      {preview && (
        <div className="card" style={{ marginTop: 8, background: 'var(--surface-2)' }}>
          <div style={{ fontSize: 13 }}><strong>{preview.count.toLocaleString()}</strong> will receive it · <span className="muted">{preview.skipped} skipped (do-not-mail / no email)</span></div>
          {!!preview.sample.length && <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>e.g. {preview.sample.map((s) => s.name || s.email).join(', ')}…</div>}
        </div>
      )}

      <label style={lbl}>Draft with Hank <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--fg-3)' }}>— tell the AI what to say (optional)</span></label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={brief} onChange={(e) => setBrief(e.target.value)} placeholder='e.g. "friendly reminder that their balance is past due, offer to set up a payment plan"' style={ctrl} />
        <button onClick={doDraft} disabled={aiBusy} className="btn" style={{ whiteSpace: 'nowrap', padding: '9px 14px', fontSize: 13 }}>{aiBusy ? 'Writing…' : '🪄 Draft'}</button>
      </div>

      <label style={lbl}>Subject</label>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line…" style={ctrl} />

      <label style={lbl}>Message <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--fg-3)' }}>— use <code>{'{{name}}'}</code> for the customer’s first name</span></label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder={'Hi {{name}},\n\n…'} style={{ ...ctrl, fontFamily: 'var(--sans)', lineHeight: 1.5, resize: 'vertical' }} />

      {msg && <div className="notice" style={{ marginTop: 10, color: msg.bad ? 'var(--red)' : 'var(--green)', borderColor: msg.bad ? 'var(--red)' : 'var(--green)' }}>{msg.t}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={doCreate} disabled={busy || !subject.trim() || !body.trim()} className="btn" style={{ opacity: (busy || !subject.trim() || !body.trim()) ? 0.55 : 1 }}>
          {busy ? 'Saving…' : '📥 Submit for approval'}
        </button>
      </div>
    </div>
  );
}

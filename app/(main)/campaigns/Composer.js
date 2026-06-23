'use client';

import { useMemo, useState, useTransition } from 'react';
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
  const [preview, setPreview] = useState(null);   // { count, skipped, truncated, recipients[] }
  const [sel, setSel] = useState({});              // customerId -> bool (the hand-picked batch)
  const [wholeAudience, setWholeAudience] = useState(false);
  const [listQ, setListQ] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const [aiBusy, startAi] = useTransition();

  if (!canCompose) return null;

  const doPreview = () => {
    setMsg(null);
    start(async () => {
      const r = await previewAudience(audience);
      if (r.ok) { setPreview(r); setSel(Object.fromEntries(r.recipients.map((x) => [x.id, true]))); setWholeAudience(false); }
      else { setPreview(null); setMsg({ bad: true, t: r.msg }); }
    });
  };
  const doDraft = () => { setMsg(null); startAi(async () => { const r = await draftCampaignAI(audience, brief); if (r.ok) { setSubject(r.subject || subject); setBody(r.body); } else setMsg({ bad: true, t: r.msg }); }); };

  const selectedIds = useMemo(() => (preview ? preview.recipients.filter((r) => sel[r.id]).map((r) => r.id) : []), [preview, sel]);
  const filtered = useMemo(() => {
    if (!preview) return [];
    const q = listQ.trim().toLowerCase();
    return q ? preview.recipients.filter((r) => `${r.name} ${r.email}`.toLowerCase().includes(q)) : preview.recipients;
  }, [preview, listQ]);

  const setAll = (val) => { if (preview) setSel(Object.fromEntries(filtered.map((r) => [r.id, val]))); };
  const sendCount = wholeAudience ? (preview ? preview.count : 0) : selectedIds.length;

  const doCreate = () => {
    setMsg(null);
    start(async () => {
      const r = await createCampaign({ subject, body, audience, includeIds: wholeAudience ? null : selectedIds });
      if (r.ok) {
        setMsg({ bad: false, t: `Draft created for ${r.count} customer${r.count === 1 ? '' : 's'}${r.deselected ? ` (${r.deselected} left out)` : ''}, ${r.skipped} unmailable. Waiting for an approver below.` });
        setSubject(''); setBody(''); setPreview(null); setSel({}); router.refresh();
      } else setMsg({ bad: true, t: r.msg });
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
        <button onClick={doPreview} disabled={busy} className="pill" style={{ cursor: 'pointer', fontSize: 12, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--fg-1)', fontWeight: 700 }}>{busy ? '…' : '👁️ Preview & pick'}</button>
      </div>

      {/* pick-a-batch list */}
      {preview && (
        <div className="card" style={{ marginTop: 8, background: 'var(--surface-2)', padding: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{preview.count.toLocaleString()} mailable</div>
            <span className="muted" style={{ fontSize: 11.5 }}>· {preview.skipped} skipped (do-not-mail / no email)</span>
            <span style={{ flex: 1 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={wholeAudience} onChange={(e) => setWholeAudience(e.target.checked)} />
              <span>Send to the <strong>entire audience</strong> ({preview.count.toLocaleString()})</span>
            </label>
          </div>

          {!wholeAudience && (
            <>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <input value={listQ} onChange={(e) => setListQ(e.target.value)} placeholder="🔎 filter this list…" style={{ ...ctrl, flex: 1, minWidth: 180, padding: '6px 9px' }} />
                <button onClick={() => setAll(true)} className="pill" style={{ cursor: 'pointer', fontSize: 11 }}>Select all{listQ ? ' shown' : ''}</button>
                <button onClick={() => setAll(false)} className="pill" style={{ cursor: 'pointer', fontSize: 11 }}>None</button>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>{selectedIds.length} picked</span>
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-1)' }}>
                {filtered.map((r) => (
                  <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!sel[r.id]} onChange={(e) => setSel((s) => ({ ...s, [r.id]: e.target.checked }))} />
                    <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{r.name || '(no name)'}</span>
                    <span className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{r.email}</span>
                  </label>
                ))}
                {!filtered.length && <div className="muted" style={{ padding: 10, fontSize: 12 }}>No one matches that filter.</div>}
              </div>
              {preview.truncated && <div className="muted" style={{ fontSize: 11, marginTop: 5, color: 'var(--amber)' }}>Showing the first 2,000. To email more than that at once, tick “entire audience” above.</div>}
            </>
          )}
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 12 }}>
        {preview && <span className="muted" style={{ fontSize: 12 }}>{wholeAudience ? `Entire audience · ${sendCount.toLocaleString()}` : `Batch · ${sendCount.toLocaleString()} picked`}</span>}
        <button onClick={doCreate} disabled={busy || !subject.trim() || !body.trim() || !preview || sendCount === 0} className="btn" style={{ opacity: (busy || !subject.trim() || !body.trim() || !preview || sendCount === 0) ? 0.55 : 1 }}>
          {busy ? 'Saving…' : `📥 Submit ${sendCount ? `(${sendCount.toLocaleString()})` : ''} for approval`}
        </button>
      </div>
      {!preview && <div className="muted" style={{ fontSize: 11.5, textAlign: 'right', marginTop: 4 }}>Hit “Preview &amp; pick” first to choose who gets it.</div>}
    </div>
  );
}

'use client';

// 📝 Work summary the tech writes ("what I did") — AI-watched. "✨ Check my notes" reads it and (1) recommends
// the right fix (grease clog only cabled → hydro-jet), (2) coaches completeness (vague "repaired toilet" →
// which toilet? what part?), and (3) offers a clean rewrite. Suggest-only. Saves to the job → shows as
// DESCRIPTION OF WORK on the invoice. Fails soft if the AI key isn't set (you can still save the note).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reviewWorkSummary } from './pricebook/customEntryActions';
import { setWorkSummary } from './actions';
import { flagOpportunities } from './opportunityActions';

export default function WorkSummaryCoach({ jobId, jobType = '', initial = '' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(initial || '');
  const [review, setReview] = useState(null);
  const [msg, setMsg] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [flagMsg, setFlagMsg] = useState(null);
  const togglePick = (i) => setPicked((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const check = () => start(async () => {
    setMsg(null); setReview(null); setPicked(new Set()); setFlagMsg(null);
    const r = await reviewWorkSummary(text, jobType);
    if (r.ok) setReview(r.review); else setMsg({ ok: false, t: r.msg });
  });
  const flag = () => start(async () => {
    setFlagMsg(null);
    const items = [...picked].map((i) => ({ title: review.recommends[i].name, detail: review.recommends[i].why || '' }));
    const r = await flagOpportunities(jobId, items);
    setFlagMsg({ ok: r.ok, t: r.msg });
    if (r.ok) { setPicked(new Set()); router.refresh(); }
  });
  const save = () => start(async () => { setMsg(null); const r = await setWorkSummary(jobId, text); setMsg({ ok: r.ok, t: r.msg }); if (r.ok) router.refresh(); });
  const useRewrite = () => { if (review?.rewrite) { setText(review.rewrite); setReview((v) => ({ ...v, rewrite: '' })); } };

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>📝 What you did <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>— shows on the invoice; AI checks it</span></div>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setReview(null); }} rows={4}
        placeholder="e.g. Kitchen sink clog — ran cable 15ft, pulled out a lot of grease…"
        style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 13.5, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button onClick={check} disabled={pending || !text.trim()} className="pill" style={{ cursor: 'pointer', color: 'var(--purple, #a78bfa)', border: '1px solid var(--purple, #a78bfa)', opacity: (pending || !text.trim()) ? 0.6 : 1 }}>{pending ? '✨ Checking…' : '✨ Check my notes'}</button>
        <button onClick={save} disabled={pending || !text.trim()} className="btn" style={{ background: 'var(--amber)', borderColor: 'var(--amber)', color: '#1a1206', opacity: (pending || !text.trim()) ? 0.6 : 1 }}>Save</button>
      </div>

      {review && (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {/* Completeness coaching */}
          {!review.clear && review.missing.length > 0 && (
            <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,179,0,.1)', border: '1px solid var(--amber-dim)' }}>
              <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--amber)' }}>Add a bit more so it's complete:</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{review.missing.map((m, i) => <li key={i} style={{ fontSize: 12.5, lineHeight: 1.5 }}>{m}</li>)}</ul>
            </div>
          )}
          {/* Fix recommendations — tick the ones to flag as a future follow-up (saved to the customer). */}
          {review.recommends.length > 0 && (
            <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(167,139,250,.08)', border: '1px solid var(--purple, #a78bfa)' }}>
              <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--purple, #a78bfa)' }}>🔧 AI recommends <span className="muted" style={{ fontWeight: 400, fontSize: 10.5 }}>— tick what they should do later</span></div>
              <div style={{ display: 'grid', gap: 5, marginTop: 6 }}>
                {review.recommends.map((r, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12.5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={picked.has(i)} onChange={() => togglePick(i)} style={{ marginTop: 2 }} />
                    <span><strong>{r.name}</strong>{r.why ? <span className="muted"> — {r.why}</span> : ''}</span>
                  </label>
                ))}
              </div>
              {picked.size > 0 && <button onClick={flag} disabled={pending} className="btn" style={{ marginTop: 8, fontSize: 12.5, background: 'var(--purple, #a78bfa)', borderColor: 'var(--purple, #a78bfa)', color: '#1a1206' }}>{pending ? '…' : `📌 Flag ${picked.size} for follow-up`}</button>}
              {flagMsg && <div style={{ fontSize: 11.5, marginTop: 6, color: flagMsg.ok ? 'var(--green)' : 'var(--red)' }}>{flagMsg.t}</div>}
              <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>Flagged = saved to this customer for a later coupon email (the office approves the send).</div>
            </div>
          )}
          {/* Clean rewrite */}
          {review.rewrite && (
            <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div className="muted" style={{ fontSize: 11, marginBottom: 3 }}>✨ Cleaned up for the customer:</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{review.rewrite}</div>
              <button onClick={useRewrite} className="pill" style={{ cursor: 'pointer', marginTop: 6, fontSize: 11, color: 'var(--green)' }}>Use this</button>
            </div>
          )}
          {review.clear && review.recommends.length === 0 && <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>✓ Clear and complete.</div>}
        </div>
      )}
      {msg && <div style={{ fontSize: 11.5, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.t}</div>}
    </div>
  );
}

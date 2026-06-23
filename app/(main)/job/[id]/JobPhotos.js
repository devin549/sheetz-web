'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { archiveJobPhoto, uploadJobPhoto, reviewPhoto, overrideCloseout } from './actions';
import { FAIL_REASONS, FAIL_LABEL } from '@/lib/qa';
import { CircleCheck, CircleX, ShieldAlert } from 'lucide-react';

const KIND_OPTIONS = [
  ['job_photo', 'Job photo'], ['before', 'Before'], ['during', 'During'], ['after', 'After'],
  ['receipt', 'Receipt'], ['damage', 'Damage'], ['equipment', 'Equipment'], ['closeout', 'Closeout'],
];

function fmtDate(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
}
function bytes(value) {
  const n = Number(value || 0);
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n > 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export default function JobPhotos({ jobId, photos, reviewByPhoto = {}, closeout, canUpload, canArchive, canReview, canOverride, isDone, currentUserId }) {
  const router = useRouter();
  const formRef = useRef(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  const [failFor, setFailFor] = useState(null);   // photoId whose fail panel is open
  const [failReason, setFailReason] = useState('blurry');
  const [failNote, setFailNote] = useState('');
  const [ovrOpen, setOvrOpen] = useState(false);
  const [ovrReason, setOvrReason] = useState('');

  const run = (fn) => { setMsg(null); start(async () => { const res = await fn(); setMsg(res); if (res?.ok) router.refresh(); }); };

  function onSubmit(e) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setMsg(null);
    start(async () => { const res = await uploadJobPhoto(data); setMsg(res); if (res.ok) { formRef.current?.reset(); router.refresh(); } });
  }
  const onArchive = (photoId) => run(() => archiveJobPhoto(photoId, jobId));
  const onPass = (photoId) => run(() => reviewPhoto(photoId, jobId, 'pass'));
  const onFail = (photoId) => run(async () => { const r = await reviewPhoto(photoId, jobId, 'fail', failReason, failNote); if (r?.ok) { setFailFor(null); setFailNote(''); } return r; });
  const onOverride = () => run(async () => { const r = await overrideCloseout(jobId, ovrReason); if (r?.ok) { setOvrOpen(false); setOvrReason(''); } return r; });

  const input = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px 11px', fontSize: 13, fontFamily: 'inherit' };
  const blocked = closeout && closeout.available !== false && !closeout.readyToClose && !isDone;

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      {/* supervisor override — only when the gate is actually blocking */}
      {canOverride && blocked && (
        <div className="card" style={{ borderLeft: '3px solid var(--amber)' }}>
          {!ovrOpen ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <ShieldAlert size={16} style={{ color: 'var(--amber)' }} />
              <span style={{ fontSize: 13 }}>Closeout is blocked. As a supervisor you can override and close it anyway.</span>
              <button className="pill" style={{ cursor: 'pointer', marginLeft: 'auto', border: '1px solid var(--amber-dim)' }} onClick={() => setOvrOpen(true)}>Override…</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>Override closeout — reason is logged</div>
              <input value={ovrReason} onChange={(e) => setOvrReason(e.target.value)} placeholder="Why are you closing this without full media?" style={input} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" disabled={pending} onClick={onOverride} style={{ opacity: pending ? 0.6 : 1 }}>Override &amp; close</button>
                <button className="pill" style={{ cursor: 'pointer' }} onClick={() => setOvrOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {canUpload && (
        <form ref={formRef} onSubmit={onSubmit} className="card card-amber" style={{ display: 'grid', gap: 10 }}>
          <input type="hidden" name="jobId" value={jobId} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 800 }}>Add photo</div>
              <div className="muted" style={{ fontSize: 11 }}>JPG, PNG, WebP, HEIC up to 10 MB</div>
            </div>
            <button className="btn" type="submit" disabled={pending} style={{ opacity: pending ? 0.65 : 1 }}>{pending ? 'Saving…' : 'Upload'}</button>
          </div>
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" required style={input} />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 180px) 1fr', gap: 8 }}>
            <select name="kind" defaultValue="job_photo" style={input}>{KIND_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <input name="tags" placeholder="tags: before, heater, damage" style={input} />
          </div>
          <textarea name="caption" rows={3} placeholder="Short note for the office, closeout, warranty, or packet…" style={{ ...input, resize: 'vertical' }} />
          <label className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" name="customerVisible" /> Customer-visible packet photo
          </label>
        </form>
      )}

      {msg && (
        <div className={msg.ok ? 'card' : 'notice'} style={msg.ok ? { borderColor: 'var(--green)' } : undefined}>
          <span style={{ color: msg.ok ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>{msg.ok ? 'Saved' : 'Error'}</span>
          <span className="muted"> — {msg.msg}</span>
        </div>
      )}

      {!photos.length && <div className="card"><span className="muted">No photos on this job yet.</span></div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, opacity: pending ? 0.75 : 1 }}>
        {photos.map((photo) => {
          const canArchiveThis = canArchive || (photo.uploaded_by && photo.uploaded_by === currentUserId);
          const rev = reviewByPhoto[photo.id];
          const failing = failFor === photo.id;
          return (
            <article key={photo.id} className="card" style={{ padding: 0, overflow: 'hidden', borderColor: rev?.result === 'fail' ? 'var(--red)' : rev?.result === 'pass' ? 'var(--green)' : 'var(--border)' }}>
              {photo.signedUrl ? (
                <a href={photo.signedUrl} target="_blank" rel="noreferrer" style={{ display: 'block', background: 'var(--surface-2)' }}>
                  <img src={photo.signedUrl} alt={photo.caption || photo.file_name || 'Job photo'} loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }} />
                </a>
              ) : (
                <div className="muted" style={{ aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', background: 'var(--surface-2)' }}>Preview unavailable</div>
              )}
              <div style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span className="pill" style={{ color: photo.customer_visible ? 'var(--green)' : 'var(--fg-2)' }}>{photo.kind || 'job_photo'}{photo.customer_visible ? ' · customer' : ''}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{bytes(photo.size_bytes)}</span>
                </div>
                {photo.caption && <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.4 }}>{photo.caption}</div>}
                {photo.tags?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>{photo.tags.map((t) => <span key={t} className="pill" style={{ fontSize: 10 }}>{t}</span>)}</div>
                )}
                <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>{photo.uploaded_by_name || photo.uploaded_by_email || 'Unknown'} · {fmtDate(photo.created_at)}</div>

                {/* QA review state */}
                {rev && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: rev.result === 'fail' ? 'var(--red)' : 'var(--green)' }}>
                    {rev.result === 'fail' ? <CircleX size={14} /> : <CircleCheck size={14} />}
                    <span style={{ fontWeight: 700 }}>{rev.result === 'fail' ? `Failed — ${FAIL_LABEL[rev.fail_reason] || 'issue'}` : 'Passed QA'}</span>
                    {rev.reviewed_by_name && <span className="muted">· {rev.reviewed_by_name}</span>}
                  </div>
                )}
                {rev?.manager_note && <div className="muted" style={{ fontSize: 11.5, marginTop: 3, fontStyle: 'italic' }}>“{rev.manager_note}”</div>}

                {/* supervisor pass/fail controls */}
                {canReview && !isDone && (
                  failing ? (
                    <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                      <select value={failReason} onChange={(e) => setFailReason(e.target.value)} style={{ ...input, padding: '7px 9px', fontSize: 12 }}>
                        {FAIL_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                      </select>
                      <input value={failNote} onChange={(e) => setFailNote(e.target.value)} placeholder="Note for the tech (optional)" style={{ ...input, padding: '7px 9px', fontSize: 12 }} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button disabled={pending} onClick={() => onFail(photo.id)} className="pill" style={{ cursor: 'pointer', background: 'rgba(239,83,80,.16)', color: 'var(--red)', fontWeight: 800, border: '1px solid var(--red)' }}>Confirm fail</button>
                        <button onClick={() => setFailFor(null)} className="pill" style={{ cursor: 'pointer' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                      <button disabled={pending} onClick={() => onPass(photo.id)} className="pill" style={{ cursor: 'pointer', flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--green)', border: '1px solid var(--border-strong)' }}><CircleCheck size={13} /> Pass</button>
                      <button disabled={pending} onClick={() => { setFailFor(photo.id); setFailReason('blurry'); setFailNote(''); }} className="pill" style={{ cursor: 'pointer', flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--red)', border: '1px solid var(--border-strong)' }}><CircleX size={13} /> Fail</button>
                    </div>
                  )
                )}

                {canArchiveThis && (
                  <button type="button" onClick={() => onArchive(photo.id)} disabled={pending}
                    style={{ marginTop: 10, width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--fg-2)', cursor: 'pointer' }}>Archive photo</button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

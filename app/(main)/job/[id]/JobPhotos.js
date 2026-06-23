'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { archiveJobPhoto, uploadJobPhoto } from './actions';

const KIND_OPTIONS = [
  ['job_photo', 'Job photo'],
  ['before', 'Before'],
  ['during', 'During'],
  ['after', 'After'],
  ['receipt', 'Receipt'],
  ['damage', 'Damage'],
  ['equipment', 'Equipment'],
  ['closeout', 'Closeout'],
];

function fmtDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function bytes(value) {
  const n = Number(value || 0);
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n > 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export default function JobPhotos({ jobId, photos, canUpload, canArchive, currentUserId }) {
  const router = useRouter();
  const formRef = useRef(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);

  function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setMsg(null);
    start(async () => {
      const res = await uploadJobPhoto(data);
      setMsg(res);
      if (res.ok) {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  function onArchive(photoId) {
    setMsg(null);
    start(async () => {
      const res = await archiveJobPhoto(photoId, jobId);
      setMsg(res);
      if (res.ok) router.refresh();
    });
  }

  const input = {
    width: '100%',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    color: 'var(--fg-1)',
    borderRadius: 8,
    padding: '10px 11px',
    fontSize: 13,
    fontFamily: 'inherit',
  };

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      {canUpload && (
        <form ref={formRef} onSubmit={onSubmit} className="card card-amber" style={{ display: 'grid', gap: 10 }}>
          <input type="hidden" name="jobId" value={jobId} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 800 }}>Add photo</div>
              <div className="muted" style={{ fontSize: 11 }}>JPG, PNG, WebP, HEIC up to 10 MB</div>
            </div>
            <button className="btn" type="submit" disabled={pending} style={{ opacity: pending ? 0.65 : 1 }}>
              {pending ? 'Saving...' : 'Upload'}
            </button>
          </div>
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" required style={input} />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 180px) 1fr', gap: 8 }}>
            <select name="kind" defaultValue="job_photo" style={input}>
              {KIND_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input name="tags" placeholder="tags: before, heater, damage" style={input} />
          </div>
          <textarea name="caption" rows={3} placeholder="Short note for the office, closeout, warranty, or packet..." style={{ ...input, resize: 'vertical' }} />
          <label className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" name="customerVisible" />
            Customer-visible packet photo
          </label>
        </form>
      )}

      {msg && (
        <div className={msg.ok ? 'card' : 'notice'} style={msg.ok ? { borderColor: 'var(--green)' } : undefined}>
          <span style={{ color: msg.ok ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>
            {msg.ok ? 'Saved' : 'Error'}
          </span>
          <span className="muted"> - {msg.msg}</span>
        </div>
      )}

      {!photos.length && (
        <div className="card">
          <span className="muted">No photos on this job yet.</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, opacity: pending ? 0.75 : 1 }}>
        {photos.map((photo) => {
          const canArchiveThis = canArchive || (photo.uploaded_by && photo.uploaded_by === currentUserId);
          return (
            <article key={photo.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {photo.signedUrl ? (
                <a href={photo.signedUrl} target="_blank" rel="noreferrer" style={{ display: 'block', background: 'var(--surface-2)' }}>
                  <img
                    src={photo.signedUrl}
                    alt={photo.caption || photo.file_name || 'Job photo'}
                    loading="lazy"
                    style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }}
                  />
                </a>
              ) : (
                <div className="muted" style={{ aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', background: 'var(--surface-2)' }}>
                  Preview unavailable
                </div>
              )}
              <div style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span className="pill" style={{ color: photo.customer_visible ? 'var(--green)' : 'var(--fg-2)' }}>
                    {photo.kind || 'job_photo'}{photo.customer_visible ? ' - customer' : ''}
                  </span>
                  <span className="muted" style={{ fontSize: 11 }}>{bytes(photo.size_bytes)}</span>
                </div>
                {photo.caption && <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.4 }}>{photo.caption}</div>}
                {photo.tags?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                    {photo.tags.map((tag) => <span key={tag} className="pill" style={{ fontSize: 10 }}>{tag}</span>)}
                  </div>
                )}
                <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                  {photo.uploaded_by_name || photo.uploaded_by_email || 'Unknown'} - {fmtDate(photo.created_at)}
                </div>
                {canArchiveThis && (
                  <button
                    type="button"
                    onClick={() => onArchive(photo.id)}
                    disabled={pending}
                    style={{
                      marginTop: 10,
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-2)',
                      color: 'var(--fg-2)',
                      cursor: 'pointer',
                    }}
                  >
                    Archive photo
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

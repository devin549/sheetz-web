'use client';

// Walkthrough video — required for closeout on some job types. Uploads DIRECT to Storage via a signed
// URL (handles big files), then records the row. Same job_photos spine (kind='walkthrough').
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createVideoUploadUrl, recordVideoUpload } from './actions';
import { Video, CircleCheck } from 'lucide-react';

export default function JobVideo({ jobId, videos = [], canUpload, requireVideo }) {
  const router = useRouter();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState(null);

  async function onPick(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setMsg(null); setBusy(true); setPct(0);
    try {
      const u = await createVideoUploadUrl(jobId, file.name, file.type, file.size);
      if (!u.ok) { setMsg(u); setBusy(false); return; }
      // Direct PUT to the signed Storage URL (with progress via XHR).
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', u.signedUrl, true);
        xhr.setRequestHeader('content-type', file.type);
        xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setPct(Math.round((ev.loaded / ev.total) * 100)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed (' + xhr.status + ')')));
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });
      const r = await recordVideoUpload(jobId, u.path, file.name, file.type, file.size);
      setMsg(r); if (r.ok) router.refresh();
    } catch (err) { setMsg({ ok: false, msg: String(err.message || err) }); }
    setBusy(false); setPct(0); if (fileRef.current) fileRef.current.value = '';
  }

  const have = videos.length > 0;
  return (
    <div className="card" style={{ marginTop: 10, borderLeft: `3px solid ${have ? 'var(--green)' : requireVideo ? 'var(--amber)' : 'var(--border)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Video size={18} style={{ color: have ? 'var(--green)' : 'var(--amber)' }} />
        <div style={{ fontWeight: 800 }}>Walkthrough video</div>
        {requireVideo && <span className="pill" style={{ marginLeft: 'auto', color: have ? 'var(--green)' : 'var(--amber)' }}>{have ? 'done ✓' : 'REQUIRED'}</span>}
      </div>

      {videos.map((v) => (
        <div key={v.id} style={{ marginBottom: 8 }}>
          {v.signedUrl ? <video src={v.signedUrl} controls playsInline style={{ width: '100%', borderRadius: 8, background: '#000', maxHeight: 280 }} />
            : <div className="muted" style={{ fontSize: 12 }}>{v.file_name} (preview unavailable)</div>}
          <div className="muted" style={{ fontSize: 11, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}><CircleCheck size={12} style={{ color: 'var(--green)' }} /> {v.uploaded_by_name || 'Tech'} · uploaded</div>
        </div>
      ))}

      {canUpload && (
        <>
          <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v,video/3gpp" capture="environment" onChange={onPick} disabled={busy} style={{ display: 'none' }} id={`vid-${jobId}`} />
          <label htmlFor={`vid-${jobId}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '13px', borderRadius: 10, border: '1px solid var(--amber-dim)', background: 'rgba(255,179,0,.10)', color: 'var(--amber)', fontWeight: 800, fontSize: 14, cursor: busy ? 'default' : 'pointer' }}>
            🎥 {busy ? `Uploading… ${pct}%` : have ? 'Add / replace video' : 'Record / upload walkthrough'}
          </label>
          {busy && <div style={{ height: 6, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden', marginTop: 8 }}><div style={{ height: '100%', width: `${pct}%`, background: 'var(--amber)' }} /></div>}
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Show the whole work area, slow 360° pan, audio on. MP4/MOV up to 300 MB.</div>
        </>
      )}
      {msg && <div style={{ fontSize: 12, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </div>
  );
}

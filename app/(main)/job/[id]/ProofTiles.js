'use client';

// Proof workspace — camera-FIRST. Each required proof is a big tile; tapping it opens the iPad camera
// directly (capture="environment"), not a file picker. The image is compressed in-browser, stamped with
// GPS/time/uploaded_by/segment, and saved straight to the job. "Upload existing" is a small fallback only.
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadJobPhoto, createVideoUploadUrl, recordVideoUpload } from './actions';
import { prescanPhoto } from './photos/visionActions';
import InAppCamera from './InAppCamera';

// Equipment plate lives on the Equipment tab (AI plate scanner → make/model/year); Receipt lives on the
// Parts/PO tab (AI receipt scan → vendor + cost). So they're NOT proof tiles here — Photos = job proof only.
const TILES = [
  { kind: 'before',      label: 'Before',           icon: '📷' },
  { kind: 'during',      label: 'Issue / During',   icon: '🔧' },
  { kind: 'after',       label: 'After',            icon: '✨' },
  { kind: 'walkthrough', label: 'Walkthrough video', icon: '🎬', video: true },
];

// Downscale big phone photos before upload (canvas → JPEG ~1600px). Non-images pass through untouched.
async function compress(file) {
  if (!/^image\//.test(file.type) || typeof createImageBitmap !== 'function') return file;
  try {
    const img = await createImageBitmap(file);
    const max = 1600; let { width, height } = img;
    if (Math.max(width, height) > max) { const s = max / Math.max(width, height); width = Math.round(width * s); height = Math.round(height * s); }
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    c.getContext('2d').drawImage(img, 0, 0, width, height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], (file.name || 'proof').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}
function getGps() {
  return new Promise((res) => { if (typeof navigator === 'undefined' || !navigator.geolocation) return res(null); navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { enableHighAccuracy: true, timeout: 6000 }); });
}

export default function ProofTiles({ jobId, photos = [], segments = [], requiredKinds = [], requireVideo = false, jobType = '' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyKind, setBusyKind] = useState(null);
  const [camKind, setCamKind] = useState(null); // open in-app camera for this tile
  const [segId, setSegId] = useState('');
  const [msg, setMsg] = useState(null);
  const fallbackRef = useRef(null);
  const [fallbackKind, setFallbackKind] = useState('before');

  const countOf = (kind) => photos.filter((p) => (p.kind || '') === kind || (kind === 'walkthrough' && /^video\//.test(p.mime_type || ''))).length;
  const required = new Set(requiredKinds);

  async function shoot(file, kind, source) {
    if (!file) return;
    setMsg(null); setBusyKind(kind);
    try {
      if (kind === 'walkthrough') { await shootVideo(file); return; }
      const small = await compress(file);
      const gps = await getGps();
      const fd = new FormData();
      fd.set('jobId', jobId); fd.set('photo', small); fd.set('kind', kind); fd.set('source', source);
      if (segId) fd.set('segmentId', segId);
      if (gps) { fd.set('lat', String(gps.lat)); fd.set('lng', String(gps.lng)); }
      const r = await uploadJobPhoto(fd);
      setMsg(r); if (r.ok) router.refresh();
    } catch (e) { setMsg({ ok: false, msg: String(e?.message || e) }); }
    finally { setBusyKind(null); }
  }

  async function shootVideo(file) {
    const mk = await createVideoUploadUrl(jobId, file.name || 'walkthrough.mp4', file.type, file.size);
    if (!mk.ok) { setMsg(mk); return; }
    const put = await fetch(mk.signedUrl, { method: 'PUT', headers: { 'content-type': file.type, 'x-upsert': 'true' }, body: file });
    if (!put.ok) { setMsg({ ok: false, msg: 'Video upload failed (' + put.status + ').' }); return; }
    const rec = await recordVideoUpload(jobId, mk.path, file.name || 'walkthrough.mp4', file.type, file.size);
    setMsg(rec); if (rec.ok) router.refresh();
  }

  const onFallback = (e) => { const f = e.target.files?.[0]; if (f) start(() => shoot(f, fallbackKind, 'upload')); e.target.value = ''; };

  return (
    <div style={{ marginTop: 4 }}>
      {segments.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span className="muted" style={{ fontSize: 12 }}>Attach to:</span>
          <select value={segId} onChange={(e) => setSegId(e.target.value)} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '6px 9px', fontSize: 12.5 }}>
            <option value="">This job (parent)</option>
            {segments.map((s) => <option key={s.id} value={s.id}>{s.segment_no || s.kind}{s.assigned_tech_name ? ` · ${s.assigned_tech_name}` : ''}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {TILES.map((t) => {
          const n = countOf(t.kind);
          const need = t.video ? requireVideo : required.has(t.kind);
          const done = n > 0;
          const busy = busyKind === t.kind || (pending && busyKind === t.kind);
          const border = done ? 'var(--green)' : need ? 'var(--amber)' : 'var(--border-strong)';
          const tileInner = (
            <>
              <span style={{ fontSize: 30 }}>{busy ? '⏳' : t.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{t.label}</span>
              <span style={{ fontSize: 11, color: done ? 'var(--green)' : need ? 'var(--amber)' : 'var(--fg-3)', fontWeight: 700 }}>
                {busy ? 'Saving…' : done ? `✓ ${n}${need ? ' · tap to add' : ''}` : need ? '⚠ Required — tap to shoot' : 'Tap to shoot'}
              </span>
            </>
          );
          const tileStyle = { position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 116, padding: 12, borderRadius: 14, cursor: 'pointer', textAlign: 'center', background: done ? 'color-mix(in oklab, var(--green) 10%, var(--surface-1))' : 'var(--surface-1)', border: `2px solid ${border}`, font: 'inherit', color: 'var(--fg-1)' };
          // Every tile — photo AND walkthrough video — opens the in-app camera (same flow for all four).
          return <button type="button" key={t.kind} onClick={() => setCamKind(t.kind)} style={tileStyle}>{tileInner}</button>;
        })}
      </div>

      {/* small fallback only */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 11.5 }}>No camera? Upload an existing file:</span>
        <select value={fallbackKind} onChange={(e) => setFallbackKind(e.target.value)} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-2)', borderRadius: 7, padding: '4px 8px', fontSize: 11.5 }}>
          {TILES.filter((t) => !t.video).map((t) => <option key={t.kind} value={t.kind}>{t.label}</option>)}
        </select>
        <button type="button" onClick={() => fallbackRef.current?.click()} className="pill" style={{ cursor: 'pointer', fontSize: 11.5 }}>Choose file…</button>
        <input ref={fallbackRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" style={{ display: 'none' }} onChange={onFallback} />
      </div>

      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg || (msg.ok ? 'Saved.' : '')}</div>}

      {/* Live in-app camera — opens on a photo tile tap, never the Files app. */}
      {camKind && (
        <InAppCamera
          label={(TILES.find((t) => t.kind === camKind) || {}).label || 'Proof'}
          video={camKind === 'walkthrough'}
          onPrecheck={camKind === 'walkthrough' ? null : (url) => prescanPhoto(url, jobType, requiredKinds)}
          onClose={() => setCamKind(null)}
          onCapture={(file) => { const k = camKind; setCamKind(null); start(() => shoot(file, k, 'camera')); }}
        />
      )}
    </div>
  );
}

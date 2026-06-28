'use client';

// 1c. Media manager — primary photo + the pricebook_media gallery/pdf/video/manufacturer-link rows. Add
// (paste url or upload), per-row customer-visible toggle, reorder, remove, promote-to-primary. Plus the
// photo finder: max-3 candidates, engine picker (Shopping/Images/Yandex/Lens), "more like this" reverse search.
import { useEffect, useRef, useState, useTransition } from 'react';
import { findItemPhotos, findSimilarItemPhotos, setItemPhotoUrl, uploadItemPhoto, loadItemMedia, addItemMedia, uploadItemMedia, setMediaVisible, reorderItemMedia, removeItemMedia, promoteMediaToPrimary } from '../catalog/photoActions';

const ENGINES = [['google_shopping', 'Shopping'], ['google_images', 'Images'], ['yandex_images', 'Yandex'], ['google_lens', 'Lens']];
const TYPE_META = { photo: ['📷', 'Photo'], pdf: ['📄', 'PDF'], video: ['🎬', 'Video'], manufacturer_link: ['🔗', 'Mfr link'] };
const lbl = { fontSize: 11, color: 'var(--fg-3)' };
const inp = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '8px 10px', fontSize: 13, width: '100%' };

export default function MediaManager({ itemId, primary, onPrimary, onMedia }) {
  const [pending, start] = useTransition();
  const [media, setMedia] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState(null);
  const [cands, setCands] = useState(null);
  const [engine, setEngine] = useState('google_shopping');
  const [addType, setAddType] = useState('manufacturer_link');
  const [addUrl, setAddUrl] = useState('');
  const fileRef = useRef(); const galleryFileRef = useRef();

  useEffect(() => {
    if (!itemId) return;
    start(async () => { const r = await loadItemMedia(itemId); if (r.ok) { setMedia(r.media || []); if (r.primary && onPrimary) onPrimary(r.primary); } else setMsg(r.msg); setLoaded(true); });
  }, [itemId]);

  // Feed the live preview the customer-visible gallery photos as they change.
  useEffect(() => { if (onMedia) onMedia(media.filter((m) => m.media_type === 'photo' && m.customer_visible).map((m) => m.url)); }, [media]);

  const find = () => start(async () => { setMsg('Searching…'); const r = await findItemPhotos(itemId, '', engine); setMsg(r.ok ? (r.photos.length ? `Found ${r.photos.length} for “${r.query}” (${engine.replace('_', ' ')})` : 'No photos — try another engine or Upload.') : r.msg); setCands((r.photos || []).slice(0, 3)); });
  const similar = (url) => start(async () => { setMsg('Finding similar…'); const r = await findSimilarItemPhotos(url, 'google_lens'); setMsg(r.ok ? `More like this (${r.photos.length})` : r.msg); setCands((r.photos || []).slice(0, 3)); });
  const pickPrimary = (url) => start(async () => { setMsg('Saving…'); const r = await setItemPhotoUrl(itemId, url); setMsg(r.msg); if (r.ok) { onPrimary && onPrimary(r.url); setCands(null); } });
  const uploadPrimary = (e) => { const f = e.target.files?.[0]; if (!f) return; start(async () => { setMsg('Uploading…'); const fd = new FormData(); fd.set('itemId', itemId); fd.set('photo', f); const r = await uploadItemPhoto(fd); setMsg(r.msg); if (r.ok) { onPrimary && onPrimary(r.url); setCands(null); } e.target.value = ''; }); };

  const addRow = () => start(async () => { if (!addUrl.trim()) { setMsg('Enter a URL.'); return; } setMsg('Adding…'); const r = await addItemMedia(itemId, addType, addUrl.trim(), '', addType !== 'manufacturer_link'); setMsg(r.msg); if (r.ok && r.row) { setMedia((m) => [...m, r.row]); setAddUrl(''); } });
  const uploadGalleryFile = (e) => { const f = e.target.files?.[0]; if (!f) return; const isPdf = /pdf/.test(f.type); start(async () => { setMsg('Uploading…'); const fd = new FormData(); fd.set('itemId', itemId); fd.set('mediaType', isPdf ? 'pdf' : 'photo'); fd.set('file', f); const r = await uploadItemMedia(fd); setMsg(r.msg); if (r.ok && r.row) setMedia((m) => [...m, r.row]); e.target.value = ''; }); };
  const toggleVis = (row) => start(async () => { const r = await setMediaVisible(row.id, !row.customer_visible); if (r.ok) setMedia((m) => m.map((x) => x.id === row.id ? { ...x, customer_visible: !x.customer_visible } : x)); else setMsg(r.msg); });
  const remove = (row) => start(async () => { const r = await removeItemMedia(row.id); if (r.ok) setMedia((m) => m.filter((x) => x.id !== row.id)); else setMsg(r.msg); });
  const promote = (row) => start(async () => { const r = await promoteMediaToPrimary(itemId, row.url); setMsg(r.msg); if (r.ok) onPrimary && onPrimary(r.url); });
  const move = (idx, dir) => { const j = idx + dir; if (j < 0 || j >= media.length) return; const next = media.slice(); [next[idx], next[j]] = [next[j], next[idx]]; setMedia(next); start(async () => { await reorderItemMedia(itemId, next.map((x) => x.id)); }); };

  return (
    <div>
      {/* Primary photo */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ width: 132, height: 132, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {primary ? <img src={primary} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 30, opacity: 0.4 }}>🔧</span>}
        </div>
        <div style={{ flex: '1 1 220px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Primary photo</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <select value={engine} onChange={(e) => setEngine(e.target.value)} style={{ ...inp, width: 'auto', padding: '6px 8px' }}>
              {ENGINES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button onClick={find} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>🔎 Find photo</button>
            <button onClick={() => fileRef.current?.click()} disabled={pending} className="pill" style={{ cursor: 'pointer' }}>⬆ Upload</button>
            <input ref={fileRef} type="file" accept="image/*" onChange={uploadPrimary} style={{ display: 'none' }} />
          </div>
          {msg && <div className="muted" style={{ fontSize: 11 }}>{msg}</div>}
          {cands && cands.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
              {cands.map((p, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={p.url} title={p.title || ''} onClick={() => pickPrimary(p.url)} alt="" style={{ width: '100%', height: 78, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)', background: '#fff' }} />
                  <button onClick={() => similar(p.url)} title="More like this" style={{ position: 'absolute', bottom: 3, right: 3, background: 'rgba(0,0,0,.65)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 9, padding: '2px 5px', cursor: 'pointer' }}>🔁 like</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Gallery / docs / links */}
      <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Gallery, PDFs &amp; links</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <select value={addType} onChange={(e) => setAddType(e.target.value)} style={{ ...inp, width: 'auto', padding: '6px 8px' }}>
            {Object.entries(TYPE_META).map(([v, [icon, l]]) => <option key={v} value={v}>{icon} {l}</option>)}
          </select>
          <input placeholder="Paste a URL…" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} style={{ ...inp, flex: '1 1 200px' }} />
          <button onClick={addRow} disabled={pending} className="btn" style={{ fontSize: 12 }}>Add</button>
          <button onClick={() => galleryFileRef.current?.click()} disabled={pending} className="btn" style={{ fontSize: 12 }}>⬆ Upload photo/PDF</button>
          <input ref={galleryFileRef} type="file" accept="image/*,application/pdf" onChange={uploadGalleryFile} style={{ display: 'none' }} />
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          {media.map((row, idx) => {
            const [icon, tl] = TYPE_META[row.media_type] || ['📎', row.media_type];
            return (
              <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: 'var(--fg-3)', fontSize: 10, opacity: idx === 0 ? 0.3 : 1, lineHeight: 1 }}>▲</button>
                  <button onClick={() => move(idx, 1)} disabled={idx === media.length - 1} style={{ background: 'none', border: 'none', cursor: idx === media.length - 1 ? 'default' : 'pointer', color: 'var(--fg-3)', fontSize: 10, opacity: idx === media.length - 1 ? 0.3 : 1, lineHeight: 1 }}>▼</button>
                </div>
                {row.media_type === 'photo' ? <img src={row.url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} /> : <span style={{ fontSize: 18 }}>{icon}</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{tl}</div>
                  <a href={row.url} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 10.5, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{row.url}</a>
                </div>
                <button onClick={() => toggleVis(row)} title="Customer-visible" className="pill" style={{ fontSize: 9.5, cursor: 'pointer', color: row.customer_visible ? 'var(--green)' : 'var(--fg-3)', border: `1px solid ${row.customer_visible ? 'var(--green)' : 'var(--border)'}` }}>{row.customer_visible ? '👁 shown' : '🚫 hidden'}</button>
                {row.media_type === 'photo' && <button onClick={() => promote(row)} className="pill" style={{ fontSize: 9.5, cursor: 'pointer' }}>★ primary</button>}
                <button onClick={() => remove(row)} title="Remove" style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
            );
          })}
          {loaded && media.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No extra media yet. Add a manufacturer link, spec PDF, or gallery photo.</div>}
        </div>
      </div>
    </div>
  );
}

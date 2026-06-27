'use client';

// 💡 Refer Opportunity to Sales — FloodBusterz (water damage) / Reline (bad sewer line) lead handoff.
// Internal tech→manager: the customer is NEVER contacted by this. Note (required) + urgent flag + damage
// photos (the manager scopes it before it sells). Mirrors the HTML refModal.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitReferral, uploadReferralPhoto } from './referActions';
import InAppCamera from './InAppCamera';

const TYPES = {
  fb: { label: 'FloodBusterz', icon: '🌊', blurb: 'Standing water, swollen baseboards, mold worry, slow leak behind a wall.' },
  reline: { label: 'Reline', icon: '🔧', blurb: 'Roots, repeat backups, collapsed/offset line — a trenchless reline candidate.' },
};

export default function ReferToSales({ jobId, customerName }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [type, setType] = useState(null); // 'fb' | 'reline' — open the panel
  const [note, setNote] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [photos, setPhotos] = useState([]); // { path, url }
  const [cam, setCam] = useState(false);
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(false);

  const open = (t) => { setType(t); setNote(''); setUrgent(false); setPhotos([]); setMsg(null); setDone(false); };
  const close = () => { setType(null); setCam(false); };

  const onPhoto = (file) => { setCam(false); const url = URL.createObjectURL(file); start(async () => { const fd = new FormData(); fd.set('jobId', jobId); fd.set('photo', file); const r = await uploadReferralPhoto(fd); if (r.ok) setPhotos((p) => [...p, { path: r.path, url }]); else setMsg(r.msg); }); };
  const removePhoto = (i) => setPhotos((p) => p.filter((_, idx) => idx !== i));

  const send = () => start(async () => {
    const r = await submitReferral({ jobId, refType: type, note, urgent, photoPaths: photos.map((p) => p.path), customerName });
    setMsg(r.msg);
    if (r.ok) { setDone(true); router.refresh(); }
  });

  const t = type ? TYPES[type] : null;
  const inp = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '10px', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div className="card" style={{ marginTop: 8, borderColor: '#64b5f6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>💡</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>See a bigger opportunity?</div>
          <div className="muted" style={{ fontSize: 11.5 }}>Hand it to Sales — they scope &amp; sell it. The customer isn’t contacted by this.</div>
        </div>
      </div>

      {!type && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={() => open('fb')} style={{ flex: 1, minWidth: 150, background: 'linear-gradient(135deg,#1976d2,#0d47a1)', color: '#fff', border: 'none', padding: '11px', borderRadius: 9, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>🌊 Refer to FloodBusterz</button>
          <button onClick={() => open('reline')} style={{ flex: 1, minWidth: 150, background: 'linear-gradient(135deg,#00897b,#00695c)', color: '#fff', border: 'none', padding: '11px', borderRadius: 9, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>🔧 Refer to Reline</button>
        </div>
      )}

      {type && !done && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 22 }}>{t.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, color: 'var(--blue)' }}>Refer to {t.label}</div><div className="muted" style={{ fontSize: 11 }}>{customerName ? `For ${customerName} · ` : ''}job {jobId}</div></div>
            <button onClick={close} style={{ background: 'transparent', border: 'none', color: 'var(--fg-2)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>

          <label style={{ fontSize: 11, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>What did you see?</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder={`e.g. ${t.blurb}`} style={{ ...inp, marginTop: 6, resize: 'vertical' }} />

          <label style={{ fontSize: 12.5, color: 'var(--fg-2)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 10 }}>
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} style={{ width: 16, height: 16 }} /> 🚨 Urgent — active damage / customer worried right now
          </label>

          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--amber-dim)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>Photos <span style={{ color: 'var(--fg-3)', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>— the manager sees these with your referral</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' }}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: 'relative', width: 64, height: 64 }}>
                  <img src={p.url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 9 }} />
                  <button onClick={() => removePhoto(i)} title="Remove" style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 999, background: 'var(--red)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', lineHeight: 1 }}>×</button>
                </div>
              ))}
              <button type="button" onClick={() => setCam(true)} disabled={pending} style={{ width: 64, height: 64, background: 'var(--surface-2)', border: '1px dashed #64b5f6', borderRadius: 10, color: '#64b5f6', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}><span style={{ fontSize: 20 }}>📸</span>Add</button>
            </div>
          </div>

          <div className="muted" style={{ fontSize: 10, marginTop: 12, lineHeight: 1.5 }}>🚦 <strong>{t.label}</strong> needs manager approval (Ronnie/Tracey) on scope before it sells — this just puts it in front of Sales so it never slips.</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
            <button onClick={close} style={{ background: 'var(--surface-2)', color: 'var(--fg-1)', border: '1px solid var(--border)', padding: 12, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button onClick={send} disabled={pending} style={{ background: 'linear-gradient(135deg,#1976d2,#0d47a1)', color: '#fff', border: 'none', padding: 12, borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: pending ? 'default' : 'pointer' }}>{pending ? 'Sending…' : 'Send to Sales →'}</button>
          </div>
        </div>
      )}

      {done && <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 9, background: 'rgba(76,175,80,.1)', border: '1px solid var(--green)', fontSize: 12.5, color: 'var(--green)' }}>✓ {msg}</div>}
      {msg && !done && <div style={{ fontSize: 11.5, marginTop: 8, color: 'var(--amber)' }}>{msg}</div>}
      {cam && <InAppCamera label={`${t?.label || ''} — damage photo`} onCapture={onPhoto} onClose={() => setCam(false)} />}
    </div>
  );
}

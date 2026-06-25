'use client';

// Snap an equipment data plate → uploads as an 'equipment' photo on this job (same job_photos spine).
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadJobPhoto } from '../actions';

export default function EquipmentSnap({ jobId }) {
  const router = useRouter();
  const ref = useRef(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);
  function onPick(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.set('jobId', jobId); fd.set('photo', file); fd.set('kind', 'equipment'); fd.set('caption', 'Equipment data plate');
    setMsg(null);
    start(async () => { const r = await uploadJobPhoto(fd); setMsg(r); if (r.ok) router.refresh(); if (ref.current) ref.current.value = ''; });
  }
  return (
    <div style={{ marginTop: 10 }}>
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={onPick} disabled={pending} style={{ display: 'none' }} id={`eq-${jobId}`} />
      <label htmlFor={`eq-${jobId}`} className="btn" style={{ cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1, display: 'inline-block' }}>{pending ? 'Uploading…' : '📷 Snap equipment plate (model/serial)'}</label>
      {msg && <span style={{ fontSize: 12, marginLeft: 10, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</span>}
    </div>
  );
}

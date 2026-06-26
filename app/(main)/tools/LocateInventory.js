'use client';

// Tools & Parts map — search a tool/part, get every match resolved to a real location (tech van / shop /
// vendor), ranked fastest-available, with Route + Reserve. Route opens Google Maps turn-by-turn; Reserve
// ties the item to the current job, notifies the holder/shop in-app, and posts a dispatch tray note.
import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { locateInventory, reserveAndRoute } from './locateActions';

const inp = { flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', padding: '11px 13px', borderRadius: 8, fontSize: 15, outline: 'none' };
const HOLDER_LABEL = { tech: 'On a van', shop: 'At the shop', vendor: 'At a vendor', job: 'On a job', unknown: 'Unknown' };

export default function LocateInventory({ currentJobId = null }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [gps, setGps] = useState(null);
  const [results, setResults] = useState(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { enableHighAccuracy: true, timeout: 8000 });
  }, []);

  const search = (e) => {
    e?.preventDefault(); setMsg(null);
    start(async () => { const r = await locateInventory(q, gps?.lat, gps?.lng, currentJobId); if (r.ok) setResults(r); else setMsg(r.msg); });
  };
  const route = (url) => { if (url && typeof window !== 'undefined') window.open(url, '_blank'); };
  const reserve = (item) => start(async () => {
    setMsg(null);
    const r = await reserveAndRoute({ jobId: currentJobId, kind: item.kind, itemId: item.id, itemName: item.name, qty: item.qty || 1, holderType: item.holderType, holderId: item.holderId, holderName: item.holderName, etaMin: item.etaMin, mapsUrl: item.mapsUrl });
    if (r.ok) { setMsg({ ok: true, msg: `Reserved — ${item.holderType === 'tech' ? 'the holder' : 'the shop'} was notified.` }); route(r.mapsUrl); router.refresh(); }
    else setMsg({ ok: false, msg: r.msg });
  });

  return (
    <div className="card card-amber" style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 16 }}>📍 Find a part or tool — nearest first</div>
      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Searches vans, shops, and vendors and ranks by how fast you can get it. {gps ? '📍 Using your location.' : 'Turn on location for distance + ETA.'}</div>
      <form onSubmit={search} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="wax ring · seesnake · 3/4 copper · expansion tank" style={inp} autoFocus />
        <button className="btn" type="submit" disabled={pending}>{pending ? '…' : 'Find'}</button>
      </form>

      {results && (
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {results.results.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No match. Try another name, or check the shop counter.</div>}
          {results.results.map((it) => (
            <div key={it.kind + it.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: `1px solid ${it.best ? '#ff8f00' : 'var(--border)'}`, opacity: it.available ? 1 : 0.62 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <span title={HOLDER_LABEL[it.holderType]} style={{ width: 12, height: 12, borderRadius: 999, background: it.best ? '#ff8f00' : it.pin, flexShrink: 0, boxShadow: it.best ? '0 0 0 3px rgba(255,143,0,.25)' : 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{it.kind === 'tool' ? '🔧' : '📦'} {it.name}{it.best && <span style={{ color: '#ff8f00', fontSize: 11, fontWeight: 800 }}> · BEST</span>}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {it.locLabel}
                    {it.distanceMi != null ? ` · ${it.distanceMi} mi · ~${it.etaMin}m` : ' · distance unknown'}
                    {it.kind === 'part' && it.qty != null ? ` · qty ${it.qty}${it.bin ? ` · bin ${it.bin}` : ''}` : ''}
                    {it.kind === 'tool' && it.battery != null ? ` · 🔋 ${it.battery}%` : ''}
                  </div>
                  {it.hours && <div className="muted" style={{ fontSize: 11 }}>🕐 {it.hours}{it.phone ? ` · ${it.phone}` : ''}</div>}
                </div>
                <span className="pill" style={{ fontSize: 9.5, color: it.available ? 'var(--green)' : 'var(--fg-3)', border: `1px solid ${it.available ? 'var(--green)' : 'var(--border)'}` }}>{it.available ? 'available' : (it.status || 'unavailable')}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {it.mapsUrl && <button onClick={() => route(it.mapsUrl)} className="pill" style={{ cursor: 'pointer', color: 'var(--blue)', border: '1px solid var(--blue)' }}>🗺 Route</button>}
                {it.available && <button onClick={() => reserve(it)} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--amber)', border: '1px solid var(--amber)' }}>🔒 Reserve &amp; go</button>}
                {it.phone && <a href={`tel:${String(it.phone).replace(/[^0-9+]/g, '')}`} className="pill" style={{ color: 'var(--fg-2)' }}>📞 Call</a>}
              </div>
            </div>
          ))}
        </div>
      )}
      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.msg}</div>}
    </div>
  );
}

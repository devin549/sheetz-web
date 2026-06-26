'use client';

// #4 owner classify UI — pick a service, see the parts it's learned (from what techs use), confirm/reject
// each, pull a LIVE vendor price (SerpAPI: Home Depot/Lowe's), and watch the rolled-up parts cost vs the
// baked-in material cost. One item can carry MANY barcodes (Everbilt@HD, Oatey@Lowe's — all one part).
import { useState, useMemo, useTransition } from 'react';
import { loadServiceParts, recordPartLink, setLinkStatus, refreshVendorPrice, addBarcode, removeBarcode } from './actions';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inp = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '8px 10px', fontSize: 13 };
const STATUS = { suggested: { c: 'var(--amber)', t: 'suggested' }, confirmed: { c: 'var(--green)', t: '✓ in parts list' }, rejected: { c: 'var(--fg-3)', t: 'rejected' } };

export default function PartsClassify({ items = [] }) {
  const [q, setQ] = useState('');
  const [svcId, setSvcId] = useState('');
  const [data, setData] = useState(null);
  const [newPart, setNewPart] = useState('');
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase(); if (!s) return [];
    return items.filter((i) => `${i.customer_name || ''} ${i.name}`.toLowerCase().includes(s)).slice(0, 8);
  }, [items, q]);

  const open = (id, label) => { setSvcId(id); setQ(label); setData(null); setMsg(null); start(async () => { const r = await loadServiceParts(id); if (r.ok) setData(r); else setMsg({ ok: false, t: r.msg }); }); };
  const reload = () => svcId && start(async () => { const r = await loadServiceParts(svcId); if (r.ok) setData(r); });
  const act = (key, fn) => { setBusy(key); setMsg(null); start(async () => { const r = await fn(); setBusy(null); setMsg({ ok: r.ok, t: r.msg }); if (r.ok) reload(); }); };

  const barcodesFor = (itemId) => (data?.barcodes || []).filter((b) => b.item_id === itemId);
  const svc = data?.service;
  const gap = svc && data ? Math.round((data.confirmedCost - svc.bakedCost) * 100) / 100 : 0;

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 800 }}>🧩 Parts &amp; live vendor cost</div>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 10 }}>Pick a service → confirm the parts it uses → pull live Home Depot / Lowe&apos;s prices. One part can have many barcodes.</div>

      {/* Service picker */}
      <div style={{ position: 'relative' }}>
        <input value={q} onChange={(e) => { setQ(e.target.value); setSvcId(''); }} placeholder="Search a service — e.g. replace toilet, faucet…" style={{ ...inp, width: '100%' }} />
        {!svcId && matches.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 3, overflow: 'hidden' }}>
            {matches.map((m) => <button key={m.id} onClick={() => open(m.id, m.customer_name || m.name)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', background: 'transparent', border: 'none', color: 'var(--fg-1)', fontSize: 13, cursor: 'pointer' }}>{m.customer_name || m.name}</button>)}
          </div>
        )}
      </div>

      {pending && !data && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Loading…</div>}

      {svc && data && (
        <div style={{ marginTop: 12 }}>
          {/* rollup */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 10 }}>
            <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Baked-in cost</div><div style={{ fontWeight: 800 }}>{money(svc.bakedCost)}</div></div>
            <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Live parts cost</div><div style={{ fontWeight: 800, color: 'var(--amber)' }}>{money(data.confirmedCost)}</div></div>
            <div><div className="muted" style={{ fontSize: 10, textTransform: 'uppercase' }}>Gap</div><div style={{ fontWeight: 800, color: gap > 0.5 ? 'var(--red)' : 'var(--green)' }}>{gap > 0 ? '+' : ''}{money(gap)}</div></div>
            <div className="muted" style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 11 }}>{gap > 0.5 ? '⚠ parts cost more than baked in — margin-watch will flag it' : 'confirm parts + price them to track cost'}</div>
          </div>

          {/* parts list */}
          <div style={{ display: 'grid', gap: 7 }}>
            {data.links.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>No parts learned yet. Add the ones this service uses below — they&apos;ll also build up as techs use them on jobs.</div>}
            {data.links.map((l) => {
              const st = STATUS[l.status] || STATUS.suggested;
              return (
                <div key={l.id} style={{ padding: '9px 11px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{l.part_name}</span>
                    {l.quantity > 1 && <span className="muted" style={{ fontSize: 11 }}>×{l.quantity}</span>}
                    {l.times_seen > 1 && <span className="pill" style={{ fontSize: 9 }}>seen {l.times_seen}×</span>}
                    <span className="pill" style={{ fontSize: 9, color: st.c, border: `1px solid ${st.c}` }}>{st.t}</span>
                    {l.vendor_price > 0 && <span style={{ fontSize: 12, color: 'var(--green)' }}>{l.vendor_seller || 'Vendor'}: {money(l.vendor_price)}</span>}
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
                      <button onClick={() => act('px' + l.id, () => refreshVendorPrice(l.id))} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--amber)' }}>{busy === 'px' + l.id ? '…' : '💲 Price it'}</button>
                      {l.status !== 'confirmed' && <button onClick={() => act('c' + l.id, () => setLinkStatus(l.id, 'confirmed'))} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--green)', border: '1px solid var(--green)' }}>✓</button>}
                      {l.status !== 'rejected' && <button onClick={() => act('r' + l.id, () => setLinkStatus(l.id, 'rejected'))} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--fg-3)' }}>✗</button>}
                    </span>
                  </div>
                  {/* barcodes on the matched part item */}
                  {l.part_item_id && <Barcodes itemId={l.part_item_id} list={barcodesFor(l.part_item_id)} onChange={reload} />}
                </div>
              );
            })}
          </div>

          {/* add a part */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input value={newPart} onChange={(e) => setNewPart(e.target.value)} placeholder="Add a part — e.g. wax ring, supply line" style={{ ...inp, flex: 1 }} />
            <button className="btn" disabled={pending || !newPart.trim()} onClick={() => act('add', async () => { const r = await recordPartLink(svcId, newPart.trim()); if (r.ok) setNewPart(''); return r; })} style={{ fontSize: 13 }}>{busy === 'add' ? '…' : 'Add part'}</button>
          </div>

          {/* barcodes on the SERVICE item itself */}
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>🔖 Barcodes for {svc.name}</div>
            <Barcodes itemId={svc.id} list={barcodesFor(svc.id)} onChange={reload} />
          </div>
        </div>
      )}
      {msg && <div style={{ fontSize: 12, marginTop: 8, color: msg.ok ? '#3fae6a' : '#d9534f' }}>{msg.t}</div>}
    </div>
  );
}

function Barcodes({ itemId, list = [], onChange }) {
  const [code, setCode] = useState('');
  const [vendor, setVendor] = useState('');
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const add = () => start(async () => { const r = await addBarcode(itemId, code.trim(), vendor.trim(), ''); if (r.ok) { setCode(''); setVendor(''); setOpen(false); onChange && onChange(); } });
  const del = (id) => start(async () => { const r = await removeBarcode(id); if (r.ok) onChange && onChange(); });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {list.map((b) => (
        <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, padding: '2px 7px', borderRadius: 7, background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          🔖 {b.barcode}{b.vendor_seller ? <span className="muted">· {b.vendor_seller}</span> : null}
          <button onClick={() => del(b.id)} disabled={pending} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 12, padding: 0 }}>×</button>
        </span>
      ))}
      {!open ? (
        <button onClick={() => setOpen(true)} className="pill" style={{ cursor: 'pointer', fontSize: 10.5 }}>＋ barcode</button>
      ) : (
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="scan / type UPC" style={{ ...inp, width: 140, padding: '5px 8px', fontSize: 11.5 }} autoFocus />
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="vendor" style={{ ...inp, width: 90, padding: '5px 8px', fontSize: 11.5 }} />
          <button onClick={add} disabled={pending || !code.trim()} className="pill" style={{ cursor: 'pointer', color: 'var(--green)' }}>{pending ? '…' : 'save'}</button>
          <button onClick={() => setOpen(false)} className="pill" style={{ cursor: 'pointer', color: 'var(--fg-3)' }}>✕</button>
        </span>
      )}
    </div>
  );
}

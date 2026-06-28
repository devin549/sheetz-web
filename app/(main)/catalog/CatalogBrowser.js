'use client';

// Immersive drill-down over Devin's REAL category tree (any depth): category tiles → subcategories → items
// → item detail with the 🧠 "commonly sold with" learner. Tap-friendly for the iPad.
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { findItemPhotos, setItemPhotoUrl, uploadItemPhoto } from './photoActions';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const HEALTH = { healthy: ['Healthy', 'var(--green)'], thin: ['Thin', 'var(--amber)'], danger: ['Danger', 'var(--red)'], missing_price: ['No price', 'var(--fg-3)'] };

// Some warranty/description copy came in from ServiceTitan as raw HTML (<strong><ul><li>). Render it as
// clean, readable text: list items → bullets, block tags → line breaks, strip the rest, decode entities.
function htmlToText(s) {
  if (!s) return '';
  return String(s)
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\s*\/\s*li\s*>/gi, '')
    .replace(/<\s*\/?\s*(ul|ol|p|div|br|h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export default function CatalogBrowser({ roots = [], related = {}, upgrades = {}, showCost, canEdit, total, myJobs = [] }) {
  const [stack, setStack] = useState([]);   // array of nodes (the drill path)
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');

  // Index everything: all items, byId, and each item's owning category node id (for sibling cross-sell).
  const { allItems, byId, catOf } = useMemo(() => {
    const all = [], byId = {}, catOf = {};
    const walk = (nodes) => nodes.forEach((n) => {
      (n.items || []).forEach((it) => { all.push(it); byId[it.id] = it; catOf[it.id] = n.id; });
      if (n.children) walk(n.children);
    });
    walk(roots);
    return { allItems: all, byId, catOf };
  }, [roots]);

  const cur = stack[stack.length - 1] || null;
  const nodes = cur ? (cur.children || []) : roots;
  const items = cur ? (cur.items || []) : [];

  const search = q.trim().toLowerCase();
  const results = search ? allItems.filter((it) => (it.name || '').toLowerCase().includes(search) || (it.description || '').toLowerCase().includes(search) || (it.sku || '').toLowerCase().includes(search)).slice(0, 80) : null;

  // "Commonly added" = learned-from-real-jobs first, then AI starter picks (each tagged ai), already blended +
  // capped server-side. No same-category fallback — a misleading list is worse than none.
  const learnedCross = useMemo(() => {
    if (!sel) return [];
    return (related[sel.id] || []).map((r) => { const it = byId[r.id]; return it ? { ...it, ai: r.ai } : null; }).filter(Boolean).slice(0, 5);
  }, [sel, related, byId]);
  // ⬆ Upgrades = owner-curated (set in the Pricebook Editor), shown at the bottom.
  const upgradeItems = useMemo(() => {
    if (!sel) return [];
    return (upgrades[sel.id] || []).map((id) => byId[id]).filter(Boolean).slice(0, 6);
  }, [sel, upgrades, byId]);


  return (
    <div className="wrap" style={{ maxWidth: 1040 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="h1" style={{ margin: 0 }}>📖 Pricebook</div>
        <span className="muted" style={{ fontSize: 12 }}>{total} items</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search — water heater, seesnake, toilet…" style={{ marginLeft: 'auto', flex: '1 1 240px', maxWidth: 360, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 10, padding: '10px 13px', fontSize: 14 }} />
      </div>

      {/* Breadcrumb */}
      {!search && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '12px 0 16px', flexWrap: 'wrap', fontSize: 13 }}>
          <button onClick={() => setStack([])} style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', fontWeight: 700, fontSize: 13, padding: 0 }}>All</button>
          {stack.map((n, i) => (
            <span key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ opacity: 0.4 }}>›</span>
              {i < stack.length - 1
                ? <button onClick={() => setStack(stack.slice(0, i + 1))} style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', fontWeight: 700, fontSize: 13, padding: 0 }}>{n.icon} {n.label}</button>
                : <span style={{ fontWeight: 700 }}>{n.icon} {n.label}</span>}
            </span>
          ))}
        </div>
      )}

      {search ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {results.map((it) => <ItemCard key={it.id} it={it} showCost={showCost} onClick={() => setSel(it)} />)}
          {results.length === 0 && <div className="muted">No matches.</div>}
        </div>
      ) : (
        <>
          {nodes.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: items.length ? 18 : 0 }}>
              {nodes.map((n) => <CatTile key={n.id} n={n} onClick={() => setStack([...stack, n])} />)}
            </div>
          )}
          {items.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {items.map((it) => <ItemCard key={it.id} it={it} showCost={showCost} onClick={() => setSel(it)} />)}
            </div>
          )}
          {nodes.length === 0 && items.length === 0 && <div className="muted">Empty category.</div>}
        </>
      )}

      {sel && <ItemSheet it={sel} showCost={showCost} canEdit={canEdit} learnedCross={learnedCross} upgradeItems={upgradeItems} myJobs={myJobs} onClose={() => setSel(null)} onPick={setSel} />}
    </div>
  );
}

// Branded "designed" category tile — our own Clog Busterz art system (dark gradient + wordmark watermark +
// big icon + name). Deterministic accent hue per category so the grid feels varied but on-brand.
function CatTile({ n, onClick }) {
  let h = 0; for (const c of n.label || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = 20 + (h % 40);            // amber/orange family, never neon
  const accent = `hsl(${hue}, 85%, 55%)`;
  return (
    <div onClick={onClick} style={{ position: 'relative', cursor: 'pointer', borderRadius: 16, overflow: 'hidden', minHeight: 150, border: '1px solid var(--border)', background: `radial-gradient(120% 90% at 20% 0%, hsla(${hue},70%,30%,.35), transparent 60%), linear-gradient(165deg, #1b1d26, #101218)`, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 14 }}>
      {n.art && <img src={n.art} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      {n.art && <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,11,15,.15) 30%, rgba(10,11,15,.88))' }} />}
      <div aria-hidden style={{ position: 'absolute', top: 10, left: 12, fontSize: 9, letterSpacing: '.18em', fontWeight: 800, color: accent, opacity: 0.55, zIndex: 1 }}>CLOG BUSTERZ</div>
      {!n.art && <div aria-hidden style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-58%)', fontSize: 64, lineHeight: 1, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.5))' }}>{n.icon}</div>}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: '#fff', lineHeight: 1.15 }}>{n.label}</div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)', marginTop: 3 }}>{n.count} item{n.count === 1 ? '' : 's'}{n.children?.length ? ` · ${n.children.length} groups` : ''} ›</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: accent }} />
    </div>
  );
}

function ItemCard({ it, showCost, onClick }) {
  return (
    <div onClick={onClick} className="card" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, padding: 13 }}>
      {it.photo
        ? <img src={it.photo} alt="" loading="lazy" style={{ width: '100%', height: 130, objectFit: 'contain', borderRadius: 8, background: '#fff', marginBottom: 4 }} />
        : <div aria-hidden style={{ width: '100%', height: 130, borderRadius: 8, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: 30, opacity: 0.4, marginBottom: 4 }}>🔧</div>}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{it.name}</span>
        <span style={{ fontWeight: 800, color: 'var(--green)' }}>{money(it.price)}</span>
      </div>
      {it.description && <div className="muted" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{it.description}</div>}
      {showCost && it.marginHealth && <span className="pill" style={{ fontSize: 9.5, alignSelf: 'flex-start', color: (HEALTH[it.marginHealth] || [])[1] }}>{(HEALTH[it.marginHealth] || [])[0]}{it.marginPct != null ? ` · ${it.marginPct}%` : ''}</span>}
    </div>
  );
}

function ItemSheet({ it, showCost, canEdit, learnedCross = [], upgradeItems = [], myJobs = [], onClose, onPick }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [photo, setPhoto] = useState(it.photo || null);
  const [cands, setCands] = useState(null);   // SerpAPI candidates
  const [msg, setMsg] = useState(null);
  const [picking, setPicking] = useState(false);   // job picker open (Add to ticket)
  const fileRef = useRef();

  // Lock the background while the drawer is open — otherwise the page scrolls behind the modal.
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prev; }; }, []);

  // Add this item to a ticket = pick one of the viewer's open jobs, then land in THAT job's estimate with
  // the item pre-loaded (the job rail is the one ticket-builder; the catalog just feeds it). Price stays
  // server-truth — we pass only the item id; the job page resolves the line.
  const whenLabel = (iso) => { if (!iso) return ''; try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
  const addToJob = (jobId) => router.push(`/job/${jobId}/pricebook?add=${encodeURIComponent(it.id)}`);

  const find = () => start(async () => { setMsg('Searching…'); const r = await findItemPhotos(it.id); setMsg(r.ok ? (r.photos.length ? `Found ${r.photos.length} for “${r.query}”` : 'No photos found — try Upload.') : r.msg); setCands(r.photos || []); });
  const pick = (url) => start(async () => { setMsg('Saving…'); const r = await setItemPhotoUrl(it.id, url); setMsg(r.msg); if (r.ok) { setPhoto(r.url); setCands(null); } });
  const upload = (e) => { const f = e.target.files?.[0]; if (!f) return; start(async () => { setMsg('Uploading…'); const fd = new FormData(); fd.set('itemId', it.id); fd.set('photo', f); const r = await uploadItemPhoto(fd); setMsg(r.msg); if (r.ok) { setPhoto(r.url); setCands(null); } }); };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-1)', borderTop: '2px solid var(--amber)', borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '20px 20px 96px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 19 }}>{it.name}</div>
            {it.sku && <div className="muted" style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{it.sku}</div>}
          </div>
          <div style={{ fontWeight: 800, fontSize: 24, color: 'var(--amber)' }}>{money(it.price)}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg-2)', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* 🎫 ADD TO TICKET — the front door from "browsing" to "building". Pick one of your open jobs and you
            land in its estimate with this item already in the cart. */}
        {!picking ? (
          <button onClick={() => setPicking(true)} className="btn" style={{ width: '100%', marginTop: 12, background: 'var(--amber)', borderColor: 'var(--amber)', color: '#1a1a1a', fontWeight: 800, fontSize: 15, padding: '12px' }}>
            ➕ Add to ticket
          </button>
        ) : (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--amber-dim)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Add to which job?</span>
              <button onClick={() => setPicking(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
            {myJobs.length === 0 ? (
              <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>No open jobs on your schedule. Open a job from <strong>My Day</strong> → its 📖 Pricebook to build the estimate there.</div>
            ) : (
              <div style={{ display: 'grid', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {myJobs.map((j) => (
                  <button key={j.id} onClick={() => addToJob(j.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 9, background: 'var(--surface-1)', border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.customer}{j.number ? ` · #${j.number}` : ''}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{[whenLabel(j.when), j.address].filter(Boolean).join(' · ')}</div>
                    </div>
                    <span className="pill" style={{ fontSize: 9, flexShrink: 0 }}>{(j.status || '').toUpperCase()}</span>
                    <span style={{ color: 'var(--amber)', fontWeight: 800, flexShrink: 0 }}>›</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {photo
          ? <img src={photo} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 12, margin: '12px 0', background: 'var(--surface-2)' }} />
          : <div aria-hidden style={{ width: '100%', height: 150, borderRadius: 12, margin: '12px 0', background: 'var(--surface-2)', border: '1px dashed var(--border)', display: 'grid', placeItems: 'center', textAlign: 'center', gap: 4 }}>
              <div style={{ fontSize: 34, opacity: 0.4 }}>🔧</div>
              <div className="muted" style={{ fontSize: 11.5 }}>No photo yet{canEdit ? ' — use 🔎 Find / ⬆ Upload below' : ''}</div>
            </div>}

        {/* Manager photo tools — find a real product photo (SerpAPI) or upload a custom one. */}
        {canEdit && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 10px', alignItems: 'center' }}>
            <button onClick={find} disabled={pending} className="pill" style={{ cursor: 'pointer', color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>🔎 Find real photo</button>
            <button onClick={() => fileRef.current?.click()} disabled={pending} className="pill" style={{ cursor: 'pointer' }}>⬆ Upload custom</button>
            <input ref={fileRef} type="file" accept="image/*" onChange={upload} style={{ display: 'none' }} />
            {msg && <span className="muted" style={{ fontSize: 11 }}>{msg}</span>}
          </div>
        )}
        {canEdit && cands && cands.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 6, marginBottom: 10 }}>
            {cands.map((p, i) => <img key={i} src={p.url} title={p.title || ''} onClick={() => pick(p.url)} alt="" style={{ width: '100%', height: 78, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)', background: '#fff' }} />)}
          </div>
        )}

        {it.description && <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--fg-2)', whiteSpace: 'pre-wrap' }}>{htmlToText(it.description)}</p>}
        {it.warranty && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--fg-2)', marginBottom: 4 }}>🛡 Warranty</div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-3)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{htmlToText(it.warranty)}</div>
          </div>
        )}
        {showCost && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {it.marginHealth && <span className="pill" style={{ fontSize: 11, color: (HEALTH[it.marginHealth] || [])[1] }}>{(HEALTH[it.marginHealth] || [])[0]}{it.marginPct != null ? ` · ${it.marginPct}% margin` : ''}</span>}
            {it.cost != null && <span className="pill" style={{ fontSize: 11, color: 'var(--fg-3)' }}>cost {money(it.cost)}</span>}
            {it.minimum != null && <span className="pill" style={{ fontSize: 11, color: 'var(--fg-3)' }}>min {money(it.minimum)}</span>}
            {it.laborHours ? <span className="pill" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{it.laborHours}h</span> : null}
          </div>
        )}
        {/* 🧠 Commonly added — ONLY what the engine learned from real jobs for this item's code. */}
        {learnedCross.length > 0 && (
          <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>🧠 Commonly added with this</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {learnedCross.map((r) => <CrossRow key={r.id} r={r} onPick={onPick} />)}
            </div>
            <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>Learned from real jobs first, topped up with AI starter picks — gets smarter as your techs sell these together.</div>
          </div>
        )}

        {/* ⬆ Upgrades — owner-curated (set in the Pricebook Editor), at the bottom. */}
        {(upgradeItems.length > 0 || canEdit) && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, color: 'var(--amber)' }}>⬆ Upgrades</div>
            {upgradeItems.length > 0
              ? <div style={{ display: 'grid', gap: 6 }}>{upgradeItems.map((r) => <CrossRow key={r.id} r={r} onPick={onPick} accent />)}</div>
              : <div className="muted" style={{ fontSize: 11.5, fontStyle: 'italic' }}>No upgrades set for this item yet.</div>}
            {canEdit && <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>Curate these in the Pricebook Editor (item → Recommended upgrades).</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// A tappable cross-sell / upgrade row with a small product thumbnail.
function CrossRow({ r, onPick, accent }) {
  return (
    <button onClick={() => onPick(r)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 9, background: 'var(--surface-2)', border: `1px solid ${accent ? 'var(--amber)' : 'var(--border)'}`, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
      {r.photo
        ? <img src={r.photo} alt="" loading="lazy" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6, background: '#fff', flexShrink: 0 }} />
        : <span aria-hidden style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--surface-1)', display: 'grid', placeItems: 'center', fontSize: 15, opacity: 0.5, flexShrink: 0 }}>🔧</span>}
      <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-1)' }}>{r.name}</span>
      {r.ai && <span className="pill" style={{ fontSize: 8.5, color: 'var(--amber)', flexShrink: 0, padding: '1px 5px' }}>AI pick</span>}
      <span style={{ fontWeight: 700, color: 'var(--green)', fontSize: 13 }}>{money(r.price)}</span>
    </button>
  );
}

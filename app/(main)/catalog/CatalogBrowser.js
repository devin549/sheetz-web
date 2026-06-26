'use client';

// Immersive drill-down Pricebook — big category tiles → subcategories → items → item detail with the
// AI "commonly sold with" learner at the bottom. Tap-friendly for the iPad; clean enough to show a customer.
import { useMemo, useState } from 'react';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const HEALTH = { healthy: ['Healthy', 'var(--green)'], thin: ['Thin', 'var(--amber)'], danger: ['Danger', 'var(--red)'], missing_price: ['No price', 'var(--fg-3)'] };

export default function CatalogBrowser({ tree = [], related = {}, showCost, total }) {
  const [stack, setStack] = useState([]);     // [topId, childId?]
  const [sel, setSel] = useState(null);       // selected item
  const [q, setQ] = useState('');

  // Flatten all items + index by id (for search + cross-sell lookup).
  const { allItems, byId, leafOf } = useMemo(() => {
    const all = [], byId = {}, leafOf = {};
    tree.forEach((top) => {
      const push = (items, leafId) => (items || []).forEach((it) => { all.push(it); byId[it.id] = it; leafOf[it.id] = leafId; });
      if (top.children) top.children.forEach((c) => push(c.items, c.id)); else push(top.items, top.id);
    });
    return { allItems: all, byId, leafOf };
  }, [tree]);

  const topNode = stack[0] ? tree.find((t) => t.id === stack[0]) : null;
  const childNode = topNode?.children && stack[1] ? topNode.children.find((c) => c.id === stack[1]) : null;

  const search = q.trim().toLowerCase();
  const searchResults = search ? allItems.filter((it) => (it.name || '').toLowerCase().includes(search) || (it.description || '').toLowerCase().includes(search) || (it.sku || '').toLowerCase().includes(search) || (it.tags || []).some((t) => String(t).toLowerCase().includes(search))).slice(0, 60) : null;

  // What to render: search > items grid (leaf/terminal) > subcategory tiles > top tiles.
  let mode = 'tiles', tiles = tree, items = null, title = 'Pricebook';
  if (searchResults) { mode = 'items'; items = searchResults; title = `“${q}” · ${searchResults.length}`; }
  else if (childNode) { mode = 'items'; items = childNode.items; title = childNode.label; }
  else if (topNode) { if (topNode.children) { mode = 'tiles'; tiles = topNode.children; title = topNode.label; } else { mode = 'items'; items = topNode.items; title = topNode.label; } }

  const crumbs = [['Pricebook', () => { setStack([]); setQ(''); }]];
  if (topNode && !search) crumbs.push([`${topNode.icon} ${topNode.label}`, () => setStack([topNode.id])]);
  if (childNode && !search) crumbs.push([`${childNode.icon} ${childNode.label}`, null]);

  // Cross-sell for the selected item: real co-occurrence first, else bucket siblings.
  const crossSell = useMemo(() => {
    if (!sel) return { learned: false, items: [] };
    const rel = (related[sel.id] || []).map((r) => byId[r.id]).filter(Boolean);
    if (rel.length) return { learned: true, items: rel.slice(0, 4) };
    const sib = allItems.filter((it) => leafOf[it.id] === leafOf[sel.id] && it.id !== sel.id).slice(0, 4);
    return { learned: false, items: sib };
  }, [sel, related, byId, allItems, leafOf]);

  const tileStyle = { background: 'linear-gradient(160deg, var(--surface-1), var(--surface-2))', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 16px', cursor: 'pointer', textAlign: 'center', transition: 'transform .1s', minHeight: 120, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 };

  return (
    <div className="wrap" style={{ maxWidth: 1040 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="h1" style={{ margin: 0 }}>📖 Pricebook</div>
        <span className="muted" style={{ fontSize: 12 }}>{total} items</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search — water heater, seesnake, toilet…" style={{ marginLeft: 'auto', flex: '1 1 240px', maxWidth: 360, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 10, padding: '10px 13px', fontSize: 14 }} />
      </div>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '12px 0 16px', flexWrap: 'wrap', fontSize: 13 }}>
        {crumbs.map(([label, fn], i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span style={{ opacity: 0.4 }}>›</span>}
            {fn ? <button onClick={fn} style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', fontWeight: 700, fontSize: 13, padding: 0 }}>{label}</button> : <span style={{ fontWeight: 700 }}>{label}</span>}
          </span>
        ))}
      </div>

      {/* Tiles (top or subcategory) */}
      {mode === 'tiles' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {tiles.map((n) => (
            <div key={n.id} onClick={() => setStack(stack[0] ? [stack[0], n.id] : [n.id])} style={tileStyle}>
              <div style={{ fontSize: 38, lineHeight: 1 }}>{n.icon}</div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{n.label}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>{n.count} item{n.count === 1 ? '' : 's'}{n.children ? ` · ${n.children.length} groups` : ''}</div>
            </div>
          ))}
        </div>
      )}

      {/* Item grid */}
      {mode === 'items' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {(items || []).map((it) => (
            <div key={it.id} onClick={() => setSel(it)} className="card" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, padding: 13 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{it.name}</span>
                <span style={{ fontWeight: 800, color: 'var(--green)' }}>{money(it.price)}</span>
              </div>
              {it.description && <div className="muted" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{it.description}</div>}
              {showCost && it.marginHealth && <span className="pill" style={{ fontSize: 9.5, alignSelf: 'flex-start', color: (HEALTH[it.marginHealth] || [])[1] }}>{(HEALTH[it.marginHealth] || [])[0]}{it.marginPct != null ? ` · ${it.marginPct}%` : ''}</span>}
            </div>
          ))}
          {(items || []).length === 0 && <div className="muted">Nothing here.</div>}
        </div>
      )}

      {/* Item detail overlay */}
      {sel && (
        <div onClick={() => setSel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 0 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-1)', borderTop: '2px solid var(--amber)', borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 19 }}>{sel.name}</div>
                {sel.sku && <div className="muted" style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{sel.sku}</div>}
              </div>
              <div style={{ fontWeight: 800, fontSize: 24, color: 'var(--amber)' }}>{money(sel.price)}</div>
              <button onClick={() => setSel(null)} style={{ background: 'none', border: 'none', color: 'var(--fg-2)', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            {sel.photo ? <img src={sel.photo} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12, margin: '12px 0', background: 'var(--surface-2)' }} /> : null}
            {sel.description && <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--fg-2)' }}>{sel.description}</p>}
            {sel.warranty && <div style={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: 6 }}>🛡 {sel.warranty}</div>}

            {showCost && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {sel.marginHealth && <span className="pill" style={{ fontSize: 11, color: (HEALTH[sel.marginHealth] || [])[1] }}>{(HEALTH[sel.marginHealth] || [])[0]}{sel.marginPct != null ? ` · ${sel.marginPct}% margin` : ''}</span>}
                {sel.cost != null && <span className="pill" style={{ fontSize: 11, color: 'var(--fg-3)' }}>cost {money(sel.cost)}</span>}
                {sel.minimum != null && <span className="pill" style={{ fontSize: 11, color: 'var(--fg-3)' }}>min {money(sel.minimum)}</span>}
                {sel.laborHours ? <span className="pill" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{sel.laborHours}h</span> : null}
              </div>
            )}

            {/* 🧠 AI cross-sell */}
            {crossSell.items.length > 0 && (
              <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>{crossSell.learned ? '🧠 Techs commonly sell these together' : '➕ Commonly added with this'}</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {crossSell.items.map((r) => (
                    <button key={r.id} onClick={() => setSel(r)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-1)' }}>{r.name}</span>
                      <span style={{ fontWeight: 700, color: 'var(--green)', fontSize: 13 }}>{money(r.price)}</span>
                    </button>
                  ))}
                </div>
                {crossSell.learned && <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>Learned from real jobs — the more you sell, the smarter this gets.</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

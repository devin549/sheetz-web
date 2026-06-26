'use client';

// Immersive drill-down over Devin's REAL category tree (any depth): category tiles → subcategories → items
// → item detail with the 🧠 "commonly sold with" learner. Tap-friendly for the iPad.
import { useMemo, useState } from 'react';

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const HEALTH = { healthy: ['Healthy', 'var(--green)'], thin: ['Thin', 'var(--amber)'], danger: ['Danger', 'var(--red)'], missing_price: ['No price', 'var(--fg-3)'] };

export default function CatalogBrowser({ roots = [], related = {}, showCost, total }) {
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

  const crossSell = useMemo(() => {
    if (!sel) return { learned: false, items: [] };
    const rel = (related[sel.id] || []).map((id) => byId[id]).filter(Boolean);
    if (rel.length) return { learned: true, items: rel.slice(0, 4) };
    const sib = allItems.filter((it) => catOf[it.id] === catOf[sel.id] && it.id !== sel.id).slice(0, 4);
    return { learned: false, items: sib };
  }, [sel, related, byId, allItems, catOf]);

  const tile = { background: 'linear-gradient(160deg, var(--surface-1), var(--surface-2))', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 16px', cursor: 'pointer', textAlign: 'center', minHeight: 124, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 };

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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: items.length ? 18 : 0 }}>
              {nodes.map((n) => (
                <div key={n.id} onClick={() => setStack([...stack, n])} style={tile}>
                  <div style={{ fontSize: 38, lineHeight: 1 }}>{n.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{n.label}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{n.count} item{n.count === 1 ? '' : 's'}{n.children?.length ? ` · ${n.children.length} groups` : ''}</div>
                </div>
              ))}
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

      {sel && <ItemSheet it={sel} showCost={showCost} crossSell={crossSell} onClose={() => setSel(null)} onPick={setSel} />}
    </div>
  );
}

function ItemCard({ it, showCost, onClick }) {
  return (
    <div onClick={onClick} className="card" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, padding: 13 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{it.name}</span>
        <span style={{ fontWeight: 800, color: 'var(--green)' }}>{money(it.price)}</span>
      </div>
      {it.description && <div className="muted" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{it.description}</div>}
      {showCost && it.marginHealth && <span className="pill" style={{ fontSize: 9.5, alignSelf: 'flex-start', color: (HEALTH[it.marginHealth] || [])[1] }}>{(HEALTH[it.marginHealth] || [])[0]}{it.marginPct != null ? ` · ${it.marginPct}%` : ''}</span>}
    </div>
  );
}

function ItemSheet({ it, showCost, crossSell, onClose, onPick }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-1)', borderTop: '2px solid var(--amber)', borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 19 }}>{it.name}</div>
            {it.sku && <div className="muted" style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{it.sku}</div>}
          </div>
          <div style={{ fontWeight: 800, fontSize: 24, color: 'var(--amber)' }}>{money(it.price)}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg-2)', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {it.photo && <img src={it.photo} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12, margin: '12px 0', background: 'var(--surface-2)' }} />}
        {it.description && <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--fg-2)' }}>{it.description}</p>}
        {it.warranty && <div style={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: 6 }}>🛡 {it.warranty}</div>}
        {showCost && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {it.marginHealth && <span className="pill" style={{ fontSize: 11, color: (HEALTH[it.marginHealth] || [])[1] }}>{(HEALTH[it.marginHealth] || [])[0]}{it.marginPct != null ? ` · ${it.marginPct}% margin` : ''}</span>}
            {it.cost != null && <span className="pill" style={{ fontSize: 11, color: 'var(--fg-3)' }}>cost {money(it.cost)}</span>}
            {it.minimum != null && <span className="pill" style={{ fontSize: 11, color: 'var(--fg-3)' }}>min {money(it.minimum)}</span>}
            {it.laborHours ? <span className="pill" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{it.laborHours}h</span> : null}
          </div>
        )}
        {crossSell.items.length > 0 && (
          <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>{crossSell.learned ? '🧠 Techs commonly sell these together' : '➕ Commonly added with this'}</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {crossSell.items.map((r) => (
                <button key={r.id} onClick={() => onPick(r)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
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
  );
}

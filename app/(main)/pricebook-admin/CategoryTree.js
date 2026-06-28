'use client';

// 1b. Category tree management — the real pricebook_categories tree (nested via parent_id, any depth) with
// item/child counts. Add main/sub, rename, reorder, move, archive, safe-delete (blocked if children/items),
// set category image (with ancestor inheritance shown in the preview swatch). Structural edits = owner/GM/OM.
import { useEffect, useState, useTransition } from 'react';
import { loadCategoryTree, addCategory, renameCategory, moveCategory, reorderCategories, archiveCategory, deleteCategory, setCategoryImage } from './editorActions';

const inp = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '7px 10px', fontSize: 13 };

export default function CategoryTree() {
  const [pending, start] = useTransition();
  const [tree, setTree] = useState(null);
  const [canStructure, setCanStructure] = useState(false);
  const [msg, setMsg] = useState(null);
  const [newMain, setNewMain] = useState('');
  const [flat, setFlat] = useState([]); // [{id,name,depth}] for the move picker

  const refresh = () => start(async () => {
    const r = await loadCategoryTree();
    if (!r.ok) { setMsg(r.msg); setTree([]); return; }
    setTree(r.tree); setCanStructure(!!r.canStructure);
    const fl = []; const walk = (nodes, d) => nodes.forEach((n) => { fl.push({ id: n.id, name: n.name, depth: d }); walk(n.children || [], d + 1); }); walk(r.tree, 0); setFlat(fl);
  });
  useEffect(() => { refresh(); }, []);

  const act = (fn) => start(async () => { const r = await fn(); setMsg(r.msg); if (r.ok) refresh(); });
  const addMain = () => { if (!newMain.trim()) return; start(async () => { const r = await addCategory(newMain.trim(), null); setMsg(r.msg); if (r.ok) { setNewMain(''); refresh(); } }); };

  if (tree === null) return <div className="muted" style={{ fontSize: 13 }}>Loading category tree…</div>;

  return (
    <div>
      {!canStructure && <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>You can view the tree; structural edits are owner/GM/OM only.</div>}
      {canStructure && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          <input placeholder="New main category…" value={newMain} onChange={(e) => setNewMain(e.target.value)} style={{ ...inp, flex: '1 1 200px' }} />
          <button className="btn" disabled={pending || !newMain.trim()} onClick={addMain} style={{ fontSize: 12 }}>＋ Add main category</button>
        </div>
      )}
      {msg && <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{msg}</div>}
      <div style={{ display: 'grid', gap: 4 }}>
        {tree.map((n, i) => <Node key={n.id} n={n} depth={0} idx={i} siblings={tree} canStructure={canStructure} act={act} flat={flat} addCategory={addCategory} reorderCategories={reorderCategories} refresh={refresh} start={start} setMsg={setMsg} />)}
        {tree.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No categories yet — add your first main category above.</div>}
      </div>
    </div>
  );
}

function Node({ n, depth, idx, siblings, canStructure, act, flat, addCategory, reorderCategories, refresh, start, setMsg }) {
  const [open, setOpen] = useState(depth < 1);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(n.name);
  const [adding, setAdding] = useState(false);
  const [subName, setSubName] = useState('');
  const [moving, setMoving] = useState(false);
  const [imgEdit, setImgEdit] = useState(false);
  const [imgUrl, setImgUrl] = useState(n.image_url || '');
  const hasKids = (n.children || []).length > 0;

  const move = (dir) => { const j = idx + dir; if (j < 0 || j >= siblings.length) return; const ids = siblings.map((s) => s.id); [ids[idx], ids[j]] = [ids[j], ids[idx]]; start(async () => { await reorderCategories(ids); refresh(); }); };
  const saveName = () => { if (!name.trim()) return; act(() => renameCategory(n.id, name.trim())); setEditing(false); };
  const addSub = () => { if (!subName.trim()) return; start(async () => { const r = await addCategory(subName.trim(), n.id); setMsg(r.msg); if (r.ok) { setSubName(''); setAdding(false); refresh(); } }); };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', paddingLeft: 8 + depth * 18, borderRadius: 8, background: n.active === false ? 'transparent' : 'var(--surface-2)', border: '1px solid var(--border)', opacity: n.active === false ? 0.55 : 1 }}>
        <button onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 'none', cursor: hasKids ? 'pointer' : 'default', color: 'var(--fg-3)', width: 16, fontSize: 11 }}>{hasKids ? (open ? '▾' : '▸') : '·'}</button>
        {/* image swatch */}
        <div title={n.image_url ? 'Has image' : 'No image (inherits parent in preview)'} style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, background: n.image_url ? `center/cover url(${n.image_url})` : 'var(--surface-1)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', fontSize: 12 }}>{!n.image_url && (n.icon || '🗂')}</div>
        {editing ? (
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveName()} autoFocus style={{ ...inp, flex: 1, padding: '4px 8px' }} />
        ) : (
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: depth === 0 ? 700 : 500 }}>{n.name}{n.active === false && <span className="muted" style={{ fontSize: 10, marginLeft: 6 }}>archived</span>}</div>
        )}
        <span className="muted" style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>{n.itemCount} item{n.itemCount === 1 ? '' : 's'}{hasKids ? ` · ${n.children.length} sub` : ''}</span>
        {canStructure && (
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {editing
              ? <><IconBtn onClick={saveName}>✓</IconBtn><IconBtn onClick={() => { setEditing(false); setName(n.name); }}>×</IconBtn></>
              : <>
                <IconBtn onClick={() => move(-1)} dim={idx === 0}>▲</IconBtn>
                <IconBtn onClick={() => move(1)} dim={idx === siblings.length - 1}>▼</IconBtn>
                <IconBtn onClick={() => setAdding((a) => !a)} title="Add subcategory">＋</IconBtn>
                <IconBtn onClick={() => setEditing(true)} title="Rename">✎</IconBtn>
                <IconBtn onClick={() => setImgEdit((v) => !v)} title="Image">🖼</IconBtn>
                <IconBtn onClick={() => setMoving((v) => !v)} title="Move">⇄</IconBtn>
                <IconBtn onClick={() => act(() => archiveCategory(n.id, n.active !== false))} title={n.active === false ? 'Restore' : 'Archive'}>{n.active === false ? '♻' : '🗄'}</IconBtn>
                <IconBtn onClick={() => act(() => deleteCategory(n.id))} title="Delete (only if empty)">🗑</IconBtn>
              </>}
          </div>
        )}
      </div>

      {imgEdit && canStructure && (
        <div style={{ display: 'flex', gap: 6, margin: '4px 0 4px', paddingLeft: 8 + depth * 18 + 22, flexWrap: 'wrap' }}>
          <input placeholder="Image URL (https…)" value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} style={{ ...inp, flex: '1 1 220px' }} />
          <button className="btn" style={{ fontSize: 11 }} onClick={() => { act(() => setCategoryImage(n.id, imgUrl.trim())); setImgEdit(false); }}>Save</button>
          {n.image_url && <button className="btn" style={{ fontSize: 11 }} onClick={() => { setImgUrl(''); act(() => setCategoryImage(n.id, '')); setImgEdit(false); }}>Clear</button>}
          <span className="muted" style={{ fontSize: 10, flexBasis: '100%' }}>Paste/upload now · AI auto-art + finder hooks coming (Phase 1d). A sub with no image inherits its parent in the customer preview.</span>
        </div>
      )}
      {moving && canStructure && (
        <div style={{ display: 'flex', gap: 6, margin: '4px 0', paddingLeft: 8 + depth * 18 + 22, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 11 }}>Move under:</span>
          <select defaultValue="" onChange={(e) => { act(() => moveCategory(n.id, e.target.value || null)); setMoving(false); }} style={{ ...inp }}>
            <option value="">— (make it a main category)</option>
            {flat.filter((f) => f.id !== n.id).map((f) => <option key={f.id} value={f.id}>{' '.repeat(f.depth * 2)}{f.name}</option>)}
          </select>
        </div>
      )}
      {adding && canStructure && (
        <div style={{ display: 'flex', gap: 6, margin: '4px 0', paddingLeft: 8 + (depth + 1) * 18 + 22 }}>
          <input placeholder="Subcategory name…" value={subName} onChange={(e) => setSubName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSub()} autoFocus style={{ ...inp, flex: 1 }} />
          <button className="btn" style={{ fontSize: 11 }} onClick={addSub}>Add</button>
        </div>
      )}

      {open && hasKids && (
        <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
          {n.children.map((child, i) => <Node key={child.id} n={child} depth={depth + 1} idx={i} siblings={n.children} canStructure={canStructure} act={act} flat={flat} addCategory={addCategory} reorderCategories={reorderCategories} refresh={refresh} start={start} setMsg={setMsg} />)}
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, onClick, title, dim }) {
  return <button onClick={onClick} title={title} disabled={dim} style={{ background: 'none', border: 'none', cursor: dim ? 'default' : 'pointer', color: 'var(--fg-3)', fontSize: 12, padding: '2px 3px', opacity: dim ? 0.3 : 1, lineHeight: 1 }}>{children}</button>;
}

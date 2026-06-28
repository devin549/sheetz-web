'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { listBundles, loadBundle, createBundle, saveBundleCopy, searchCatalog, addBundleItem, updateBundleItem, removeBundleItem } from './actions';
import { computeLadder, coachLadder, TIER_KEYS, TIER_META } from '@/lib/bundleCoach';

// 🪜 Good/Better/Best Bundle Builder — owner authors the customer-facing tier ladder for a job type.
// The owner is the ONLY price-mover: tier prices are the live SUM of the real catalog items picked into each
// tier (same math as the close). This tool composes; it never sets or invents a price.

const inp = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '9px 11px', fontSize: 14, width: '100%', boxSizing: 'border-box' };
const lbl = { fontSize: 11, color: 'var(--fg-3)', display: 'block', marginBottom: 3 };
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString();
const COACH_COLOR = { warn: 'var(--red)', tip: 'var(--amber)', ok: 'var(--green)' };
const COACH_ICON = { warn: '⚠', tip: '💡', ok: '✓' };

export default function BundleBuilder({ initialBundles = [] }) {
  const [bundles, setBundles] = useState(initialBundles);
  const [sel, setSel] = useState(null);        // loaded bundle { bundle, items }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const refreshList = useCallback(async () => { const r = await listBundles(); if (r.ok) setBundles(r.bundles); }, []);

  const open = async (id) => {
    setBusy(true); setMsg(null);
    const r = await loadBundle(id);
    if (r.ok) setSel({ bundle: r.bundle, items: r.items }); else setMsg({ ok: false, t: r.msg });
    setBusy(false);
  };

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>🪜 Good / Better / Best Bundle Builder</div>
      <div style={{ color: 'var(--mute)', fontSize: 12.5, marginBottom: 12 }}>
        Author the three-tier ladder a customer sees at the close for a job type. <strong>Prices come from the real catalog
        items you pick</strong> — this tool composes the tiers, it never sets a price. The middle tier (<strong>Better</strong>) is
        the recommended hero where most customers land.
      </div>

      {!sel ? (
        <BundleList bundles={bundles} onOpen={open} onCreated={async (id) => { await refreshList(); open(id); }} busy={busy} />
      ) : (
        <BundleEditor
          data={sel}
          onClose={() => { setSel(null); refreshList(); }}
          onUpdate={(next) => setSel(next)}
        />
      )}
      {msg && <div style={{ marginTop: 10, color: msg.ok ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>{msg.t}</div>}
    </div>
  );
}

// ── Bundle list + create new ──────────────────────────────────────────────────────────────────────────
function BundleList({ bundles, onOpen, onCreated, busy }) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', jobType: '', goodName: 'Good', betterName: 'Better', bestName: 'Best' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const up = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const create = async () => {
    setSaving(true); setErr(null);
    const r = await createBundle(form);
    setSaving(false);
    if (r.ok) { setShow(false); setForm({ name: '', slug: '', jobType: '', goodName: 'Good', betterName: 'Better', bestName: 'Best' }); onCreated(r.bundleId); }
    else setErr(r.msg);
  };

  return (
    <div>
      <div style={{ display: 'grid', gap: 7 }}>
        {bundles.map((b) => {
          const full = b.tierNames === 3 && b.itemCount > 0;
          return (
            <button key={b.id} onClick={() => onOpen(b.id)} disabled={busy} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--fg-1)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{b.name} {b.jobType && <span style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 500 }}>· {b.jobType}</span>}</div>
                <div style={{ fontSize: 11.5, color: 'var(--mute)', marginTop: 2 }}>{b.itemCount} item{b.itemCount === 1 ? '' : 's'} · {b.slug}</div>
              </div>
              {full
                ? <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--green)', border: '1px solid var(--green)', borderRadius: 6, padding: '2px 7px' }}>GBB ✓</span>
                : <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--amber)', border: '1px solid var(--amber)', borderRadius: 6, padding: '2px 7px' }}>flat — no ladder</span>}
            </button>
          );
        })}
        {!bundles.length && <div style={{ color: 'var(--mute)', fontSize: 13 }}>No bundles yet — create one below.</div>}
      </div>

      {!show ? (
        <button className="btn" onClick={() => setShow(true)} style={{ marginTop: 12 }}>➕ New bundle</button>
      ) : (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>New bundle</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
            <div><label style={lbl}>Bundle name *</label><input style={inp} value={form.name} onChange={(e) => up('name', e.target.value)} placeholder="Water Heater Install" /></div>
            <div><label style={lbl}>Job type (matches job.job_type)</label><input style={inp} value={form.jobType} onChange={(e) => up('jobType', e.target.value)} placeholder="water heater" /></div>
          </div>
          <div style={{ marginBottom: 8 }}><label style={lbl}>Slug (auto from name if blank)</label><input style={inp} value={form.slug} onChange={(e) => up('slug', e.target.value)} placeholder="water-heater-install" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div><label style={lbl}>Good tier name</label><input style={inp} value={form.goodName} onChange={(e) => up('goodName', e.target.value)} /></div>
            <div><label style={lbl}>Better tier name ⭐</label><input style={inp} value={form.betterName} onChange={(e) => up('betterName', e.target.value)} /></div>
            <div><label style={lbl}>Best tier name</label><input style={inp} value={form.bestName} onChange={(e) => up('bestName', e.target.value)} /></div>
          </div>
          {err && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" disabled={saving || !form.name.trim()} onClick={create}>{saving ? 'Creating…' : 'Create bundle'}</button>
            <button className="btn" onClick={() => setShow(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bundle editor: copy + items + live ladder ──────────────────────────────────────────────────────────
function BundleEditor({ data, onClose, onUpdate }) {
  const { bundle, items } = data;
  return (
    <div>
      <button className="btn" onClick={onClose} style={{ marginBottom: 12, fontSize: 12 }}>← All bundles</button>
      <LadderPreview items={items} bundle={bundle} />
      <BundleItems data={data} onUpdate={onUpdate} />
      <CopyEditor bundle={bundle} onSaved={(b) => onUpdate({ ...data, bundle: b })} />
    </div>
  );
}

// Live Good/Better/Best ladder preview — SAME math as the close. Better is the recommended hero.
function LadderPreview({ items }) {
  const ladder = useMemo(() => computeLadder(items.map((it) => ({ price: it.price, quantity: it.quantity, tiers: it.tiers }))), [items]);
  const coach = useMemo(() => coachLadder(items.map((it) => ({ price: it.price, quantity: it.quantity, tiers: it.tiers }))), [items]);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 6 }}>LIVE LADDER (what the customer sees — same math as the close)</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {TIER_KEYS.map((k) => {
          const t = ladder[k]; const meta = TIER_META[k]; const hero = t.recommended;
          return (
            <div key={k} style={{
              padding: '12px 10px', borderRadius: 12, textAlign: 'center',
              background: hero ? '#221d10' : 'var(--surface-2)',
              border: `${hero ? 2 : 1}px solid ${hero ? '#ffce5a' : 'var(--border)'}`,
              boxShadow: hero ? '0 0 0 3px rgba(255,179,0,.12)' : 'none',
              color: hero ? '#f4f1ea' : 'var(--fg-1)',
            }}>
              {hero && <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.05em', color: '#ffce5a', marginBottom: 3 }}>★ RECOMMENDED</div>}
              <div style={{ fontSize: 18 }}>{meta.icon}</div>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{meta.label}</div>
              <div style={{ fontWeight: 900, fontSize: 20, marginTop: 4, color: hero ? '#ffce5a' : (t.price > 0 ? 'var(--fg-1)' : 'var(--fg-3)') }}>{t.count ? money(t.price) : '—'}</div>
              <div style={{ fontSize: 10.5, color: hero ? 'rgba(244,241,234,.6)' : 'var(--mute)', marginTop: 2 }}>{t.count} item{t.count === 1 ? '' : 's'}</div>
            </div>
          );
        })}
      </div>
      {coach.length > 0 && (
        <div style={{ display: 'grid', gap: 5, marginTop: 10 }}>
          {coach.map((c, i) => (
            <div key={i} style={{ fontSize: 12, lineHeight: 1.45, color: COACH_COLOR[c.level] || 'var(--mute)', display: 'flex', gap: 7 }}>
              <span style={{ flexShrink: 0 }}>{COACH_ICON[c.level] || '•'}</span><span>{c.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Items in the bundle + per-item tier checkboxes / qty / remove + catalog search to add.
function BundleItems({ data, onUpdate }) {
  const { bundle, items } = data;
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [rowBusy, setRowBusy] = useState(null);
  const tRef = useRef(null);

  const apply = (r) => { if (r.ok) onUpdate({ ...data, bundle: r.bundle, items: r.items }); };

  const doSearch = (term) => {
    clearTimeout(tRef.current);
    tRef.current = setTimeout(async () => {
      if (!term.trim()) { setResults([]); return; }
      setSearching(true);
      const r = await searchCatalog(term);
      setSearching(false);
      if (r.ok) setResults(r.items);
    }, 280);
  };
  const onQ = (v) => { setQ(v); doSearch(v); };

  const add = async (itemId) => {
    setRowBusy('add:' + itemId);
    const r = await addBundleItem(bundle.id, itemId, ['good', 'better', 'best'], 1, items.length);
    setRowBusy(null);
    apply(r); setQ(''); setResults([]);
  };
  const toggleTier = async (row, key) => {
    const next = row.tiers.includes(key) ? row.tiers.filter((t) => t !== key) : [...row.tiers, key];
    if (!next.length) return; // keep at least one tier
    setRowBusy('tier:' + row.id);
    const r = await updateBundleItem(row.id, { tiers: next });
    setRowBusy(null); apply(r);
  };
  const setQty = async (row, qty) => {
    setRowBusy('qty:' + row.id);
    const r = await updateBundleItem(row.id, { quantity: qty });
    setRowBusy(null); apply(r);
  };
  const remove = async (row) => {
    setRowBusy('rm:' + row.id);
    const r = await removeBundleItem(row.id);
    setRowBusy(null); apply(r);
  };

  const inBundle = new Set(items.map((i) => i.itemId));

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 6 }}>ITEMS — check which tiers include each (that builds the ladder)</div>

      {/* tier legend */}
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--mute)', marginBottom: 8, flexWrap: 'wrap' }}>
        {TIER_KEYS.map((k) => <span key={k} title={TIER_META[k].role}>{TIER_META[k].icon} <strong>{TIER_META[k].label}</strong> — {TIER_META[k].role.split(' — ')[0].slice(0, 40)}</span>)}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        {items.map((row) => (
          <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', opacity: rowBusy && rowBusy.endsWith(row.id) ? 0.6 : 1 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</div>
              <div style={{ fontSize: 11, color: 'var(--mute)' }}>{money(row.price)}{row.cost > 0 && <span style={{ color: 'var(--fg-3)' }}> · cost {money(row.cost)}</span>}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {TIER_KEYS.map((k) => {
                const on = row.tiers.includes(k);
                return (
                  <label key={k} title={TIER_META[k].label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 9, color: on ? 'var(--amber)' : 'var(--fg-3)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={on} onChange={() => toggleTier(row, k)} style={{ accentColor: '#ffb300' }} />
                    {TIER_META[k].label[0]}
                  </label>
                );
              })}
            </div>
            <label style={{ fontSize: 10, color: 'var(--fg-3)' }}>qty
              <input type="number" min={1} value={row.quantity} onChange={(e) => setQty(row, e.target.value)} style={{ ...inp, width: 52, padding: '5px 6px', marginTop: 2 }} />
            </label>
            <button className="btn" onClick={() => remove(row)} style={{ fontSize: 11, padding: '5px 9px' }}>✕</button>
          </div>
        ))}
        {!items.length && <div style={{ color: 'var(--mute)', fontSize: 13 }}>No items yet — search the catalog below to add some.</div>}
      </div>

      {/* catalog search → add */}
      <div style={{ marginTop: 10 }}>
        <input placeholder="🔎 Search the 549-item catalog to add (name / sku)…" value={q} onChange={(e) => onQ(e.target.value)} style={inp} />
        {searching && <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 6 }}>Searching…</div>}
        {results.length > 0 && (
          <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
            {results.map((it) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 11px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{it.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--mute)' }}>{money(it.price)}{it.sku && <span style={{ color: 'var(--fg-3)' }}> · {it.sku}</span>}</div>
                </div>
                {inBundle.has(it.id)
                  ? <span style={{ fontSize: 10, color: 'var(--green)' }}>in bundle ✓</span>
                  : <button className="btn btn-primary" disabled={rowBusy === 'add:' + it.id} onClick={() => add(it.id)} style={{ fontSize: 11, padding: '5px 11px' }}>{rowBusy === 'add:' + it.id ? '…' : '+ Add'}</button>}
              </div>
            ))}
          </div>
        )}
        {q.trim() && !searching && !results.length && <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 6 }}>No catalog items match — if a job type needs a part that isn't here, add it in the Pricebook Editor above first. Don't invent a price.</div>}
      </div>
    </div>
  );
}

// Customer-facing copy editor (tier names, best-for lines, description, warranty, photo, CTA). Never prices.
function CopyEditor({ bundle, onSaved }) {
  const [f, setF] = useState({
    name: bundle.name, jobType: bundle.jobType,
    goodName: bundle.goodName, betterName: bundle.betterName, bestName: bundle.bestName,
    goodBestFor: bundle.goodBestFor, betterBestFor: bundle.betterBestFor, bestBestFor: bundle.bestBestFor,
    goodCaveat: bundle.goodCaveat || '', betterCaveat: bundle.betterCaveat || '', bestCaveat: bundle.bestCaveat || '',
    customerDescription: bundle.customerDescription, warrantyText: bundle.warrantyText,
    customerPhotoUrl: bundle.customerPhotoUrl, approvalButtonText: bundle.approvalButtonText,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true); setMsg(null);
    const r = await saveBundleCopy(bundle.id, f);
    setSaving(false);
    setMsg({ ok: r.ok, t: r.msg });
    if (r.ok) onSaved({ ...bundle, ...f });
  };

  return (
    <details style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>✏️ Customer-facing copy (names, best-for, caveats, warranty, photo)</summary>
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
          <div><label style={lbl}>Bundle name *</label><input style={inp} value={f.name} onChange={(e) => up('name', e.target.value)} /></div>
          <div><label style={lbl}>Job type</label><input style={inp} value={f.jobType} onChange={(e) => up('jobType', e.target.value)} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div><label style={lbl}>Good name</label><input style={inp} value={f.goodName} onChange={(e) => up('goodName', e.target.value)} /></div>
          <div><label style={lbl}>Better name ⭐</label><input style={inp} value={f.betterName} onChange={(e) => up('betterName', e.target.value)} /></div>
          <div><label style={lbl}>Best name</label><input style={inp} value={f.bestName} onChange={(e) => up('bestName', e.target.value)} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div><label style={lbl}>Good — best for…</label><input style={inp} value={f.goodBestFor} onChange={(e) => up('goodBestFor', e.target.value)} placeholder="Tight budget, quick fix" /></div>
          <div><label style={lbl}>Better — best for… ⭐</label><input style={inp} value={f.betterBestFor} onChange={(e) => up('betterBestFor', e.target.value)} placeholder="Most homes — fixes the cause" /></div>
          <div><label style={lbl}>Best — best for…</label><input style={inp} value={f.bestBestFor} onChange={(e) => up('bestBestFor', e.target.value)} placeholder="Total peace of mind" /></div>
        </div>
        <div style={{ marginBottom: 3 }}><label style={lbl}>❌ "Does NOT cover" — the red loss-contrast on the close (usually on Good only). Must be TRUE, never fear-mongering.</label></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div><input style={inp} value={f.goodCaveat} onChange={(e) => up('goodCaveat', e.target.value)} placeholder="A basic snake leaves grease — can re-clog in months" /></div>
          <div><input style={inp} value={f.betterCaveat} onChange={(e) => up('betterCaveat', e.target.value)} placeholder="(usually blank)" /></div>
          <div><input style={inp} value={f.bestCaveat} onChange={(e) => up('bestCaveat', e.target.value)} placeholder="(usually blank)" /></div>
        </div>
        <div style={{ marginBottom: 8 }}><label style={lbl}>Customer description (headline blurb)</label><textarea rows={2} style={{ ...inp, fontFamily: 'inherit' }} value={f.customerDescription} onChange={(e) => up('customerDescription', e.target.value)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div><label style={lbl}>Warranty text</label><input style={inp} value={f.warrantyText} onChange={(e) => up('warrantyText', e.target.value)} placeholder="1-year guarantee in writing" /></div>
          <div><label style={lbl}>Approve button text</label><input style={inp} value={f.approvalButtonText} onChange={(e) => up('approvalButtonText', e.target.value)} placeholder="Approve & Schedule" /></div>
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Customer photo URL</label><input style={inp} value={f.customerPhotoUrl} onChange={(e) => up('customerPhotoUrl', e.target.value)} placeholder="https://…" /></div>
        <button className="btn btn-primary" disabled={saving || !f.name.trim()} onClick={save}>{saving ? 'Saving…' : 'Save copy'}</button>
        {msg && <span style={{ marginLeft: 12, color: msg.ok ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>{msg.t}</span>}
      </div>
    </details>
  );
}

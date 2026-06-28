'use client';

// 1a. Full item editor (ServiceTitan field-parity) — opens an item into a tabbed sheet with every field,
// a role-aware price section (owner writes live; GM/OM queue for owner approval; marketing = price LOCKED),
// the media manager (1c), recommended-upgrade pins, and a live mobile preview (1e) that reflects edits with
// no save. Price/cost/margin live ONLY in the price section (gated) — never leaks to the customer preview.
import { useEffect, useRef, useState, useTransition } from 'react';
import { loadItemEditor, updateItem, updateItemPricing, addItemUpgrade, removeItemUpgrade, searchPricebookItems } from './editorActions';
import MediaManager from './MediaManager';
import MobilePreview from './MobilePreview';

const inp = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 7, padding: '9px 11px', fontSize: 14, width: '100%', boxSizing: 'border-box' };
const lbl = { fontSize: 11, color: 'var(--fg-3)', display: 'block', marginBottom: 3 };
const Field = ({ label, children }) => <label style={{ display: 'block' }}><span style={lbl}>{label}</span>{children}</label>;
const Toggle = ({ label, hint, checked, onChange }) => (
  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
    <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
    <span><span style={{ fontWeight: 600 }}>{label}</span>{hint && <span className="muted" style={{ display: 'block', fontSize: 11 }}>{hint}</span>}</span>
  </label>
);

const TABS = [['details', 'Details'], ['copy', 'Customer copy'], ['pricing', 'Pricing'], ['media', 'Media'], ['upsell', 'Upsell'], ['meta', 'Accounting']];

export default function ItemEditor({ itemId, cats = [], onClose, onSaved }) {
  const [pending, start] = useTransition();
  const [loading, setLoading] = useState(true);
  const [perms, setPerms] = useState({ canPrice: false, canMovePrice: false, role: '' });
  const [mig124, setMig124] = useState(true);
  const [tab, setTab] = useState('details');
  const [msg, setMsg] = useState(null);
  const [upgrades, setUpgrades] = useState([]);
  const [previewMode, setPreviewMode] = useState('customer');
  const [primary, setPrimary] = useState(null);
  const [gallery, setGallery] = useState([]);

  // Merchandising/meta form (non-price).
  const [form, setForm] = useState(null);
  // Price section state (separate gate).
  const [pricing, setPricing] = useState(null);
  const f = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const p = (k, v) => setPricing((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    start(async () => {
      const r = await loadItemEditor(itemId);
      if (!r.ok) { setMsg(r.msg); setLoading(false); return; }
      const it = r.item;
      setPerms(r.perms); setMig124(r.mig124); setUpgrades(r.upgrades || []); setPrimary(it.primary_photo_url || null);
      setForm({
        name: it.name || '', sku: it.sku || '', customerName: it.customer_name || '', internalName: it.internal_name || '',
        customerDescription: it.customer_description || '', shortDescription: it.short_description || '', internalNotes: it.internal_notes || '',
        warrantyText: it.warranty_text || '', legalText: it.legal_text || '',
        taxable: !!it.taxable, allowDiscountCodes: it.allow_discount_codes !== false, allowMembershipDiscount: it.allow_membership_discount !== false,
        isLaborService: !!it.is_labor_service, customerVisible: it.customer_visible !== false, active: it.active !== false,
        categoryId: it.category_id || '', tags: (it.tags || []).join(', '), conversionTags: (it.conversion_tags || []).join(', '),
        crossSaleGroup: it.cross_sale_group || '', projectLabel: it.project_label || '',
        glAccount: it.gl_account || '', expenseAccount: it.expense_account || '', businessUnit: it.business_unit || '',
        laborHours: it.estimated_labor_hours ?? '', manufacturer: it.manufacturer || '', manufacturerPart: it.manufacturer_part_number || '',
      });
      setPricing({
        retailPrice: it.retail_price ?? '', memberPrice: it.member_price ?? '', addOnPrice: it.add_on_price ?? '', memberAddOnPrice: it.member_add_on_price ?? '',
        minimumPrice: it.minimum_price ?? '', targetMargin: it.target_margin_pct ?? '', materialCost: it.estimated_material_cost ?? '',
      });
      setLoading(false);
    });
  }, [itemId]);

  const saveContent = () => start(async () => { setMsg('Saving…'); const r = await updateItem(itemId, form); setMsg(r.msg); if (r.ok && onSaved) onSaved(); });
  const savePricing = () => start(async () => { setMsg('Saving pricing…'); const r = await updateItemPricing(itemId, pricing); setMsg(r.msg); if (r.ok && onSaved) onSaved(); });

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
  const panel = { background: 'var(--surface-1)', border: '1px solid var(--border)', borderTop: '3px solid var(--amber)', borderRadius: 16, width: '100%', maxWidth: 1080, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' };

  if (loading || !form) return (
    <div style={overlay} onClick={onClose}><div style={{ ...panel, maxWidth: 480, padding: 40, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}><div className="muted">{msg || 'Loading editor…'}</div></div></div>
  );

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{form.customerName || form.name || 'Edit item'}</div>
            <div className="muted" style={{ fontSize: 11 }}>{perms.role} · {perms.canMovePrice ? 'full price control' : (perms.canPrice ? 'price edits queue for owner approval' : 'merchandising only — price locked')}</div>
          </div>
          {!mig124 && <span className="pill" style={{ fontSize: 10, color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>Run migration 124 for all fields</span>}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg-2)', fontSize: 26, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left: form */}
          <div style={{ flex: '1 1 0', minWidth: 0, overflowY: 'auto', padding: 18 }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              {TABS.filter(([k]) => k !== 'pricing' || perms.canPrice).map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} style={{ border: 'none', cursor: 'pointer', borderRadius: 7, padding: '6px 11px', fontSize: 12.5, fontWeight: 700, background: tab === k ? 'var(--amber)' : 'var(--surface-2)', color: tab === k ? '#1a1206' : 'var(--fg-2)' }}>{l}</button>
              ))}
            </div>

            {tab === 'details' && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Code / SKU (max 31)"><input maxLength={31} value={form.sku} onChange={(e) => f('sku', e.target.value)} style={inp} /></Field>
                  <Field label="Category"><select value={form.categoryId} onChange={(e) => f('categoryId', e.target.value)} style={inp}><option value="">(no category)</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                </div>
                <Field label="Name (internal/sellable)"><input value={form.name} onChange={(e) => f('name', e.target.value)} style={inp} /></Field>
                <Field label="Internal name (alt)"><input value={form.internalName} onChange={(e) => f('internalName', e.target.value)} style={inp} /></Field>
                <Field label="Internal notes (never shown to customer)"><textarea rows={2} value={form.internalNotes} onChange={(e) => f('internalNotes', e.target.value)} style={{ ...inp, fontFamily: 'inherit' }} /></Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Manufacturer"><input value={form.manufacturer} onChange={(e) => f('manufacturer', e.target.value)} style={inp} /></Field>
                  <Field label="Mfr part #"><input value={form.manufacturerPart} onChange={(e) => f('manufacturerPart', e.target.value)} style={inp} /></Field>
                </div>
                <div style={{ display: 'grid', gap: 9, padding: 12, background: 'var(--surface-2)', borderRadius: 9 }}>
                  <Toggle label="Customer-visible" hint="Show on customer-facing estimates" checked={form.customerVisible} onChange={(v) => f('customerVisible', v)} />
                  <Toggle label="Active" hint="Sellable in the pricebook" checked={form.active} onChange={(v) => f('active', v)} />
                  <Toggle label="Labor service" hint="This line is labor, not a material part" checked={form.isLaborService} onChange={(v) => f('isLaborService', v)} />
                  <Toggle label="Taxable" hint="Tax stays OFF by default — only applies if an estimate opts in" checked={form.taxable} onChange={(v) => f('taxable', v)} />
                  <Toggle label="Allow discount codes" checked={form.allowDiscountCodes} onChange={(v) => f('allowDiscountCodes', v)} />
                  <Toggle label="Allow membership discounts" checked={form.allowMembershipDiscount} onChange={(v) => f('allowMembershipDiscount', v)} />
                </div>
              </div>
            )}

            {tab === 'copy' && (
              <div style={{ display: 'grid', gap: 12 }}>
                <Field label="Customer-facing name (what they see)"><input value={form.customerName} onChange={(e) => f('customerName', e.target.value)} style={inp} /></Field>
                <Field label="Item description (customer)"><textarea rows={4} value={form.customerDescription} onChange={(e) => f('customerDescription', e.target.value)} style={{ ...inp, fontFamily: 'inherit' }} placeholder="The outcome the customer gets — sell the feeling, not the spec." /></Field>
                <Field label="Short description"><input value={form.shortDescription} onChange={(e) => f('shortDescription', e.target.value)} style={inp} /></Field>
                <Field label="Warranty description (shown 🛡 on the close)"><textarea rows={2} value={form.warrantyText} onChange={(e) => f('warrantyText', e.target.value)} style={{ ...inp, fontFamily: 'inherit' }} /></Field>
                <Field label="Legal / disclaimer (CB's own text — rides the approval)"><textarea rows={3} value={form.legalText} onChange={(e) => f('legalText', e.target.value)} style={{ ...inp, fontFamily: 'inherit', fontSize: 12 }} /></Field>
              </div>
            )}

            {tab === 'pricing' && perms.canPrice && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ fontSize: 12, color: perms.canMovePrice ? 'var(--green)' : 'var(--amber)', background: 'var(--surface-2)', borderRadius: 8, padding: '8px 11px' }}>
                  {perms.canMovePrice ? '✓ As owner, your price changes go live immediately.' : '⚠ Price changes route to the owner-approve queue — the live price won’t move until the owner signs off. (Member/add-on/cost/margin save directly.)'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Static price ($)"><input type="number" inputMode="decimal" value={pricing.retailPrice} onChange={(e) => p('retailPrice', e.target.value)} style={inp} /></Field>
                  <Field label="Member price ($)"><input type="number" inputMode="decimal" value={pricing.memberPrice} onChange={(e) => p('memberPrice', e.target.value)} style={inp} /></Field>
                  <Field label="Add-on price ($)"><input type="number" inputMode="decimal" value={pricing.addOnPrice} onChange={(e) => p('addOnPrice', e.target.value)} style={inp} /></Field>
                  <Field label="Member add-on price ($)"><input type="number" inputMode="decimal" value={pricing.memberAddOnPrice} onChange={(e) => p('memberAddOnPrice', e.target.value)} style={inp} /></Field>
                  <Field label="Min price ($)"><input type="number" inputMode="decimal" value={pricing.minimumPrice} onChange={(e) => p('minimumPrice', e.target.value)} style={inp} /></Field>
                  <Field label="Target margin (%)"><input type="number" inputMode="decimal" value={pricing.targetMargin} onChange={(e) => p('targetMargin', e.target.value)} style={inp} /></Field>
                  <Field label="Material cost ($)"><input type="number" inputMode="decimal" value={pricing.materialCost} onChange={(e) => p('materialCost', e.target.value)} style={inp} /></Field>
                  <Field label="Labor hours"><input type="number" inputMode="decimal" value={form.laborHours} onChange={(e) => f('laborHours', e.target.value)} style={inp} /></Field>
                </div>
                <button className="btn btn-primary" disabled={pending} onClick={savePricing} style={{ justifySelf: 'start' }}>{pending ? 'Saving…' : (perms.canMovePrice ? 'Save pricing' : 'Save & request price approval')}</button>
              </div>
            )}

            {tab === 'media' && <MediaManager itemId={itemId} primary={primary} onPrimary={setPrimary} onMedia={setGallery} />}

            {tab === 'upsell' && <UpsellTab itemId={itemId} upgrades={upgrades} setUpgrades={setUpgrades} form={form} f={f} start={start} />}

            {tab === 'meta' && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="GL account"><input value={form.glAccount} onChange={(e) => f('glAccount', e.target.value)} style={inp} /></Field>
                  <Field label="Expense account"><input value={form.expenseAccount} onChange={(e) => f('expenseAccount', e.target.value)} style={inp} /></Field>
                  <Field label="Business unit"><input value={form.businessUnit} onChange={(e) => f('businessUnit', e.target.value)} style={inp} /></Field>
                  <Field label="Project label"><input value={form.projectLabel} onChange={(e) => f('projectLabel', e.target.value)} style={inp} /></Field>
                  <Field label="Cross-sale group"><input value={form.crossSaleGroup} onChange={(e) => f('crossSaleGroup', e.target.value)} style={inp} /></Field>
                </div>
                <Field label="Tags (comma-separated)"><input value={form.tags} onChange={(e) => f('tags', e.target.value)} style={inp} /></Field>
                <Field label="Conversion tags (comma-separated)"><input value={form.conversionTags} onChange={(e) => f('conversionTags', e.target.value)} style={inp} /></Field>
              </div>
            )}

            {/* Save bar (content) */}
            {tab !== 'pricing' && tab !== 'media' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-primary" disabled={pending} onClick={saveContent}>{pending ? 'Saving…' : 'Save changes'}</button>
                {msg && <span style={{ fontSize: 13, color: 'var(--mute)' }}>{msg}</span>}
              </div>
            )}
            {(tab === 'pricing' || tab === 'media') && msg && <div style={{ fontSize: 13, color: 'var(--mute)', marginTop: 12 }}>{msg}</div>}
          </div>

          {/* Right: live mobile preview (hidden on narrow screens via CSS-ish inline; always present here) */}
          <div style={{ flex: '0 0 380px', borderLeft: '1px solid var(--border)', background: 'var(--surface-2)', overflowY: 'auto', padding: 18 }}>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', textAlign: 'center', marginBottom: 10 }}>LIVE PREVIEW — updates as you type</div>
            <MobilePreview
              form={form} pricing={perms.canPrice ? pricing : { retailPrice: pricing.retailPrice }} primaryPhoto={primary} gallery={gallery}
              mode={previewMode} onMode={setPreviewMode}
              onPhone={() => setMsg('“Open on my phone” — TODO: generate a one-item /e/[token] preview link or QR.')}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Upsell tab — pin recommended upgrades via the catalog search (owner curates alongside the learned co-sells).
function UpsellTab({ itemId, upgrades, setUpgrades, form, f, start }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef();

  const onSearch = (val) => {
    setQ(val); clearTimeout(timer.current);
    if (val.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => { setBusy(true); const r = await searchPricebookItems(val, 10); setBusy(false); if (r.ok) setResults((r.items || []).filter((i) => i.id !== itemId && !upgrades.some((u) => u.id === i.id))); }, 250);
  };
  const pin = (it) => start(async () => { const r = await addItemUpgrade(itemId, it.id); if (r.ok) { setUpgrades((u) => [...u, { id: it.id, name: it.name, price: it.price, linkId: 'tmp' }]); setResults((rs) => rs.filter((x) => x.id !== it.id)); } });
  const unpin = (u) => start(async () => { if (u.linkId && u.linkId !== 'tmp') { await removeItemUpgrade(u.linkId); } setUpgrades((list) => list.filter((x) => x.id !== u.id)); });

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Field label="Cross-sale group (items in the same group cross-suggest)"><input value={form.crossSaleGroup} onChange={(e) => f('crossSaleGroup', e.target.value)} style={inp} /></Field>
      <div>
        <span style={lbl}>Recommended upgrades (pinned by you)</span>
        <div style={{ display: 'grid', gap: 6 }}>
          {upgrades.map((u) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: 13 }}>{u.name}</span>
              <span style={{ fontWeight: 700, color: 'var(--green)', fontSize: 13 }}>${u.price}</span>
              <button onClick={() => unpin(u)} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
          ))}
          {upgrades.length === 0 && <div className="muted" style={{ fontSize: 12 }}>None pinned yet. Search below to add an add-on / upgrade.</div>}
        </div>
      </div>
      <div>
        <input placeholder="Search items to pin as an upgrade…" value={q} onChange={(e) => onSearch(e.target.value)} style={inp} />
        {busy && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Searching…</div>}
        {results.length > 0 && (
          <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
            {results.map((it) => (
              <button key={it.id} onClick={() => pin(it)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 8, background: 'var(--surface-1)', border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ flex: 1, fontSize: 13 }}>{it.name}{it.sku && <span className="muted" style={{ fontSize: 10, marginLeft: 6 }}>{it.sku}</span>}</span>
                <span style={{ fontWeight: 700, color: 'var(--green)', fontSize: 13 }}>${it.price}</span>
                <span style={{ color: 'var(--amber)', fontSize: 14 }}>＋</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

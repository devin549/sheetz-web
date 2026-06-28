'use client';

// Live mobile preview — a phone frame that flips between the TECH card (the in-app pricebook item card the
// tech taps to sell) and the CUSTOMER close (the single-item version of the /e/[token] render). It reads the
// LIVE editor state (no save) so every keystroke is reflected instantly. This is the same visual language as
// app/e/[token]/CustomerEstimate.js so "what you edit is what they see."

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// Customer-close palette — hardcoded-dark surface needs hardcoded-LIGHT text (daylight-safe), CB amber/gold,
// green = value/GO. Mirrors CustomerEstimate.js exactly.
const AMBER = '#ffb300', GOLD = '#ffce5a', GREEN = '#3fb56a', GREEN_INK = '#06210f';
const SURF = '#171922', SURF2 = '#1f2230', LINE = '#2c3040', INK = '#f4f1ea', MUTE = 'rgba(244,241,234,.66)', FAINT = 'rgba(244,241,234,.5)';

export default function MobilePreview({ form, pricing, primaryPhoto, gallery = [], mode, onMode, onPhone }) {
  const name = (form.customerName || form.name || 'New item').trim();
  const desc = (form.customerDescription || form.shortDescription || '').trim();
  const price = Number(pricing.retailPrice) || 0;
  const memberPrice = Number(pricing.memberPrice) || 0;
  const addOn = Number(pricing.addOnPrice) || 0;
  const warranty = (form.warrantyText || '').trim();
  const legal = (form.legalText || '').trim();
  const customerHidden = form.customerVisible === false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      {/* Tech ⇄ Customer switch */}
      <div style={{ display: 'inline-flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999, padding: 3 }}>
        {[['customer', '👁 Customer close'], ['tech', '🔧 Tech card']].map(([k, label]) => (
          <button key={k} onClick={() => onMode(k)} style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '7px 14px', fontSize: 12.5, fontWeight: 800, background: mode === k ? 'var(--amber)' : 'transparent', color: mode === k ? '#1a1206' : 'var(--fg-2)' }}>{label}</button>
        ))}
      </div>

      {/* Phone frame */}
      <div style={{ width: 320, borderRadius: 34, border: '10px solid #0a0b0e', background: mode === 'customer' ? '#0e0f12' : 'var(--surface-1)', boxShadow: '0 18px 50px rgba(0,0,0,.45)', overflow: 'hidden' }}>
        <div style={{ height: 26, background: '#0a0b0e', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ width: 90, height: 6, borderRadius: 6, background: '#23252c' }} />
        </div>
        <div style={{ maxHeight: 520, overflowY: 'auto', padding: mode === 'customer' ? '16px 14px 20px' : 14 }}>
          {mode === 'customer'
            ? <CustomerCard {...{ name, desc, price, memberPrice, warranty, legal, primaryPhoto, gallery, customerHidden }} />
            : <TechCard {...{ form, pricing, name, desc, price, addOn, primaryPhoto, customerHidden }} />}
        </div>
      </div>

      <button onClick={onPhone} className="btn" style={{ fontSize: 12 }}>📲 Open on my phone</button>
    </div>
  );
}

// CUSTOMER close — the single-item picture-forward card the customer sees (matches /e/[token] flat line).
function CustomerCard({ name, desc, price, memberPrice, warranty, legal, primaryPhoto, gallery, customerHidden }) {
  const card = { background: SURF, border: `1px solid ${LINE}`, borderRadius: 16, padding: 16, color: INK };
  return (
    <div style={{ color: INK }}>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 10, letterSpacing: '.18em', color: AMBER, fontWeight: 800 }}>CLOG BUSTERZ PLUMBING</div>
        <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4, color: INK }}>Your options</div>
      </div>
      {customerHidden && <div style={{ fontSize: 11, color: '#ffb38a', textAlign: 'center', marginBottom: 10 }}>⚠ Hidden from customers (internal-only) — won’t actually appear.</div>}
      <div style={card}>
        {primaryPhoto
          ? <img src={primaryPhoto} alt="" style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 12, marginBottom: 12, background: SURF2 }} />
          : <div style={{ width: '100%', height: 96, borderRadius: 12, marginBottom: 12, background: SURF2, display: 'grid', placeItems: 'center', fontSize: 30, opacity: 0.5 }}>🔧</div>}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 16, flex: 1, color: INK }}>{name}</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: AMBER }}>{money(price)}</div>
        </div>
        {memberPrice > 0 && memberPrice < price && (
          <div style={{ fontSize: 12, color: GREEN, fontWeight: 700, marginTop: 5 }}>Members pay {money(memberPrice)} — join &amp; save {money(price - memberPrice)}.</div>
        )}
        {desc && <p style={{ color: MUTE, fontSize: 13, lineHeight: 1.5, margin: '8px 0 0' }}>{desc}</p>}
        {gallery && gallery.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto' }}>
            {gallery.slice(0, 6).map((g, gi) => <img key={gi} src={g} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />)}
          </div>
        )}
        {warranty && <div style={{ fontSize: 12, color: GREEN, fontWeight: 700, marginTop: 10 }}>🛡 {warranty}</div>}
      </div>
      <button style={{ width: '100%', marginTop: 12, padding: 14, borderRadius: 12, border: 'none', fontWeight: 900, fontSize: 15, background: GREEN, color: GREEN_INK, cursor: 'default' }}>✓ Approve &amp; Schedule</button>
      {legal && <div style={{ fontSize: 9.5, color: FAINT, marginTop: 10, lineHeight: 1.45 }}>{legal}</div>}
      <div style={{ textAlign: 'center', fontSize: 10, color: FAINT, marginTop: 12 }}>Prices held for this visit. Nothing is charged until you approve.</div>
    </div>
  );
}

// TECH card — the in-app pricebook item card (mirrors catalog ItemSheet: photo, name, price, add-on, desc).
function TechCard({ form, pricing, name, desc, price, addOn, primaryPhoto, customerHidden }) {
  const cost = Number(pricing.materialCost) || 0;
  const margin = price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : null;
  return (
    <div className="card" style={{ padding: 14 }}>
      {primaryPhoto && <img src={primaryPhoto} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 10, marginBottom: 10, background: 'var(--surface-2)' }} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{name}</div>
          {form.sku && <div className="muted" style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{form.sku}</div>}
        </div>
        <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--amber)' }}>{money(price)}</div>
      </div>
      {form.isLaborService && <span className="pill" style={{ fontSize: 9.5, marginTop: 6, display: 'inline-block' }}>🛠 Labor</span>}
      {desc && <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--fg-2)', marginTop: 8 }}>{desc}</p>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: 'var(--fg-3)' }}>
        {addOn > 0 && <span>add-on {money(addOn)}</span>}
        {Number(form.laborHours) > 0 && <span>{form.laborHours}h</span>}
        {cost > 0 && <span>cost {money(cost)}</span>}
        {margin != null && <span style={{ color: margin >= 50 ? 'var(--green)' : 'var(--amber)' }}>{margin}% margin</span>}
        {customerHidden && <span style={{ color: 'var(--fg-3)' }}>· internal</span>}
      </div>
      <button className="btn btn-primary" style={{ marginTop: 12, width: '100%', cursor: 'default' }}>＋ Add to estimate</button>
      <div className="muted" style={{ fontSize: 10, marginTop: 8 }}>Tech-only view — margin/cost stay hidden from the customer screen.</div>
    </div>
  );
}

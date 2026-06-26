'use client';

// In-job Sheetz Pricebook — the customer-facing sales engine. Two modes: Customer (clean checkout, no
// cost/margin) and Tech (adds margin health + minimums). Good/Better/Best ladder + job-smart suggestions
// + estimate cart that records the sale tied to the job.
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recordSale } from './actions';
import { createEstimate } from './estimateActions';

const money = (n) => '$' + (Number(n) || 0).toLocaleString();
const TIER_STYLE = { good: { c: 'var(--fg-2)' }, better: { c: 'var(--amber)' }, best: { c: 'var(--green)' } };

export default function PricebookClient({ job, customer, items = [], categories = [], tiers = [], bundle, showMargin }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState('tech');     // 'tech' | 'customer'
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('suggested');
  const [cart, setCart] = useState([]);          // { id, name, price, soldPrice }
  const [msg, setMsg] = useState(null);
  const [approval, setApproval] = useState(null);
  const [tierKey, setTierKey] = useState(null);
  const [link, setLink] = useState(null);        // shareable estimate link once sent
  const [copied, setCopied] = useState(false);
  const customerMode = mode === 'customer';

  const add = (it) => { setLink(null); setCart((c) => c.find((x) => x.id === it.id) ? c : [...c, { id: it.id, name: it.name, price: it.price, soldPrice: it.price, min: it.internal?.minimum ?? null }]); };
  const addTier = (tier) => { setLink(null); setTierKey(tier.key); setCart(() => tier.items.map((it) => ({ id: it.id, name: it.name, price: it.price, soldPrice: it.price, min: null }))); };
  const remove = (id) => setCart((c) => c.filter((x) => x.id !== id));
  const setPrice = (id, v) => setCart((c) => c.map((x) => x.id === id ? { ...x, soldPrice: v } : x));

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((it) => {
      if (cat === 'suggested' && !it.suggested && !s) return true; // suggested view shows all but pins suggested
      if (cat !== 'suggested' && it.categoryId !== cat) return false;
      if (!s) return true;
      return (it.name || '').toLowerCase().includes(s) || (it.description || '').toLowerCase().includes(s) || (it.internal?.sku || '').toLowerCase().includes(s) || (it.internal?.tags || []).some((t) => String(t).toLowerCase().includes(s));
    }).sort((a, b) => (b.suggested ? 1 : 0) - (a.suggested ? 1 : 0));
  }, [items, q, cat]);

  const subtotal = cart.reduce((s, l) => s + (Number(l.soldPrice) || 0), 0);
  const cardFee = Math.round(subtotal * 0.04 * 100) / 100;
  const anyBelowMin = cart.some((l) => l.min != null && Number(l.soldPrice) < l.min);

  const sell = () => start(async () => {
    setMsg(null); setApproval(null);
    const r = await recordSale(job.id, cart.map((l) => ({ itemId: l.id, quantity: 1, soldPrice: Number(l.soldPrice) || 0 })));
    if (r.ok) { setMsg(r.msg); setCart([]); router.refresh(); }
    else if (r.needsApproval) setApproval(r.msg);
    else setMsg(r.msg);
  });
  // Build a customer-safe estimate and get a shareable link (text it OR present on this iPad).
  const present = () => start(async () => {
    setMsg(null); setLink(null);
    const r = await createEstimate(job.id, cart.map((l) => ({ itemId: l.id, soldPrice: Number(l.soldPrice) || 0, quantity: 1 })), { tierKey, bundleSlug: bundle?.slug, headline: tierKey && bundle ? bundle.name : '' });
    if (r.ok) setLink(r.url); else setMsg(r.msg);
  });
  const fullLink = link && typeof window !== 'undefined' ? window.location.origin + link : link;
  const copyLink = () => { try { navigator.clipboard.writeText(fullLink); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {} };

  const input = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 };

  return (
    <div style={{ marginTop: 10 }}>
      {/* Mode toggle — flip the iPad to the customer with one tap. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999, padding: 3 }}>
          {[['tech', '🔧 Tech view'], ['customer', '👤 Customer view']].map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 700, background: mode === m ? 'var(--amber)' : 'transparent', color: mode === m ? '#1a1a1a' : 'var(--fg-2)' }}>{label}</button>
          ))}
        </div>
        {customerMode && <span className="muted" style={{ fontSize: 11.5 }}>Safe to show the customer — no cost or margin on screen.</span>}
      </div>

      {/* GOOD / BETTER / BEST ladder — the clean checkout. */}
      {tiers.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {bundle?.customerDescription && <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{bundle.customerDescription}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {tiers.map((t) => {
              const st = TIER_STYLE[t.key] || TIER_STYLE.good;
              return (
                <div key={t.key} className="card" style={{ borderColor: t.recommended ? 'var(--amber)' : 'var(--border)', borderWidth: t.recommended ? 2 : 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                  {t.recommended && <span style={{ position: 'absolute', top: -10, left: 12, background: 'var(--amber)', color: '#1a1a1a', fontSize: 9.5, fontWeight: 800, padding: '2px 8px', borderRadius: 20 }}>MOST POPULAR</span>}
                  <div style={{ fontWeight: 800, fontSize: 15, color: st.c }}>{t.name}</div>
                  {t.bestFor && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{t.bestFor}</div>}
                  <div style={{ display: 'grid', gap: 3, margin: '9px 0' }}>
                    {t.includes.map((inc, i) => <div key={i} style={{ fontSize: 12.5, display: 'flex', gap: 6 }}><span style={{ color: 'var(--green)' }}>✓</span>{inc}</div>)}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--amber)', marginTop: 'auto' }}>{money(t.price)}</div>
                  <button onClick={() => addTier(t)} className="btn" style={{ marginTop: 8, width: '100%' }}>Choose {t.name}</button>
                </div>
              );
            })}
          </div>
          {bundle?.warranty && <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>🛡 {bundle.warranty}</div>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        {/* Suggestions / search / categories */}
        <div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search price, part, symptom, SKU — try seesnake, wax ring, water heater" style={{ ...input, width: '100%', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <button onClick={() => setCat('suggested')} className="pill" style={{ cursor: 'pointer', fontWeight: cat === 'suggested' ? 800 : 600, border: cat === 'suggested' ? '1px solid var(--amber)' : '1px solid var(--border)' }}>⭐ Suggested</button>
            {categories.map((c) => <button key={c.id} onClick={() => setCat(c.id)} className="pill" style={{ cursor: 'pointer', fontWeight: cat === c.id ? 800 : 600, border: cat === c.id ? '1px solid var(--amber)' : '1px solid var(--border)' }}>{c.name}</button>)}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {filtered.slice(0, 40).map((it) => (
              <div key={it.id} className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '11px 13px', borderColor: it.suggested ? 'var(--amber-dim)' : 'var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{it.name}</span>
                    {it.suggested && <span className="pill" style={{ fontSize: 9, color: 'var(--amber)' }}>job-smart</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{it.description}</div>
                  {!customerMode && showMargin && it.internal && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 5, flexWrap: 'wrap', fontSize: 10.5 }}>
                      <span className="pill" style={{ color: it.internal.marginHealth === 'healthy' ? 'var(--green)' : 'var(--red)' }}>{it.internal.marginPct != null ? `${it.internal.marginPct}% margin` : 'no price'}</span>
                      <span className="pill" style={{ color: 'var(--fg-3)' }}>target {it.internal.targetMargin}%</span>
                      {it.internal.minimum != null && <span className="pill" style={{ color: 'var(--fg-3)' }}>min {money(it.internal.minimum)}</span>}
                      {it.internal.laborHours ? <span className="pill" style={{ color: 'var(--fg-3)' }}>{it.internal.laborHours}h</span> : null}
                    </div>
                  )}
                  {!customerMode && showMargin && it.internal?.internalNotes && <div className="muted" style={{ fontSize: 10.5, marginTop: 4, fontStyle: 'italic' }}>🔒 {it.internal.internalNotes}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: 'var(--green)' }}>{money(it.price)}</div>
                  <button onClick={() => add(it)} className="pill" style={{ cursor: 'pointer', marginTop: 6, color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>＋ Add</button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>No items match. Try a different word or category.</div>}
          </div>
        </div>

        {/* Estimate cart */}
        <div style={{ position: 'sticky', top: 8 }}>
          <div className="card card-amber">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontWeight: 800 }}>🧾 Estimate</span>
              {job.number && <span className="pill" style={{ fontSize: 9.5, marginLeft: 'auto' }}>{job.number}</span>}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{customer.name}{customer.address ? ` · ${customer.address}` : ''}</div>

            <div style={{ display: 'grid', gap: 5, margin: '10px 0' }}>
              {cart.length === 0 && <div className="muted" style={{ fontSize: 12 }}>Pick a Good/Better/Best option or add items.</div>}
              {cart.map((l) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                    {!customerMode && l.min != null && Number(l.soldPrice) < l.min && <div style={{ fontSize: 10, color: 'var(--red)' }}>below min {money(l.min)}</div>}
                  </div>
                  {!customerMode && showMargin
                    ? <input value={l.soldPrice} onChange={(e) => setPrice(l.id, e.target.value)} inputMode="decimal" style={{ ...input, width: 78, padding: '5px 7px', textAlign: 'right', fontSize: 12.5 }} />
                    : <span style={{ fontWeight: 700 }}>{money(l.soldPrice)}</span>}
                  <button onClick={() => remove(l.id)} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 15 }}>×</button>
                </div>
              ))}
            </div>

            {cart.length > 0 && (
              <div style={{ borderTop: '2px solid var(--amber-dim)', paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span className="muted">Subtotal</span><strong>{money(subtotal)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}><span className="muted">Card fee if paid online</span><span className="muted">{money(cardFee)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, marginTop: 4 }}><strong>Customer pays</strong><strong style={{ color: 'var(--amber)' }}>{money(subtotal + cardFee)}</strong></div>
              </div>
            )}

            {approval && <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(239,83,80,.1)', border: '1px solid var(--red)', fontSize: 11.5, color: 'var(--red)' }}>🚦 {approval}</div>}
            {!customerMode && anyBelowMin && !approval && <div className="muted" style={{ fontSize: 10.5, marginTop: 6, color: 'var(--amber)' }}>A line is below minimum — a manager must approve the discount.</div>}

            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <button onClick={present} disabled={pending || cart.length === 0} className="btn" style={{ background: 'var(--amber)', borderColor: 'var(--amber)', color: '#1a1a1a' }}>{pending ? 'Building…' : '📲 Present / send to customer'}</button>
              <button onClick={sell} disabled={pending || cart.length === 0} className="pill" style={{ cursor: 'pointer', justifyContent: 'center', display: 'flex', color: 'var(--green)' }}>✓ Or record sold now</button>
            </div>

            {link && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'var(--surface-1)', border: '1px solid var(--green)' }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6, color: 'var(--green)' }}>✓ Clean customer page ready</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--amber)', wordBreak: 'break-all', marginBottom: 8 }}>{fullLink}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <a href={link} target="_blank" rel="noreferrer" className="pill" style={{ color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>📱 Present here</a>
                  <button onClick={copyLink} className="pill" style={{ cursor: 'pointer' }}>{copied ? '✓ Copied' : '🔗 Copy link'}</button>
                  {customer.phone && <a href={`sms:${String(customer.phone).replace(/[^0-9+]/g, '')}${typeof navigator !== 'undefined' && /iPhone|iPad/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent('Here are your options from Clog Busterz: ' + fullLink)}`} className="pill" style={{ color: 'var(--blue)' }}>💬 Text it</a>}
                </div>
              </div>
            )}
            {msg && <div style={{ fontSize: 11.5, marginTop: 8, color: 'var(--green)' }}>{msg}</div>}

            {/* Objection helpers — quick reframes when the customer hesitates (customer-safe). */}
            {cart.length > 0 && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>If they hesitate</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <span className="pill" style={{ fontSize: 10 }}>💸 Financing available</span>
                  <span className="pill" style={{ fontSize: 10 }}>🗓 Hold today's price</span>
                  <span className="pill" style={{ fontSize: 10 }}>🛡 Warranty included</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

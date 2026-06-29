'use client';

// In-job Sheetz Pricebook — the customer-facing sales engine. ONE view (the full drill-down catalog);
// cost/margin show to managers only. Good/Better/Best ladder + estimate cart that records the sale tied to
// the job (see PricebookClient below for the layout).
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recordSale } from './actions';
import { createEstimate, sendEstimateText, sendEstimateEmail, markPresented, getEstimateStatus } from './estimateActions';
import { coachCustomEntry, recordCustomEntry } from './customEntryActions';
import BarcodeScan from './BarcodeScan';
import PartPhotoScan from './PartPhotoScan';
import CatalogBrowser from '@/app/(main)/catalog/CatalogBrowser';

const money = (n) => '$' + (Number(n) || 0).toLocaleString();
const TIER_STYLE = { good: { c: 'var(--fg-2)' }, better: { c: 'var(--amber)' }, best: { c: 'var(--green)' } };

// The in-job pricebook = the full drill-down catalog (browse → add to THIS estimate) + the Good/Better/Best
// ladder + a sticky estimate cart + Present/Send. One view (no tech/customer toggle); cost shows to managers
// only via the browse. Scan-a-part and Custom-item live at the top of the browse.
export default function PricebookClient({ job, customer, roots = [], related = {}, upgrades = {}, total = 0, tiers = [], bundle, showMargin, plans = [], preAdd = null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cart, setCart] = useState([]);          // { id, name, price, soldPrice, min }
  const [msg, setMsg] = useState(null);
  const [approval, setApproval] = useState(null);
  const [tierKey, setTierKey] = useState(null);
  const [link, setLink] = useState(null);        // shareable estimate link once sent
  const [token, setToken] = useState(null);       // the estimate token (drives send picker + live mirror)
  const [copied, setCopied] = useState(false);
  const [sendMsg, setSendMsg] = useState(null);   // feedback from text/email send
  const [live, setLive] = useState(null);         // { status, terminal, selectedTierKey, approvalChannel, approvedName }

  // ⭐ Member pricing — turn it on when offering a membership; each plan carries its own savings %.
  const [memberOn, setMemberOn] = useState(false);
  const [planSlug, setPlanSlug] = useState(plans[0]?.slug || '');
  const plan = plans.find((p) => p.slug === planSlug) || plans[0] || null;
  const memberDisc = memberOn && plan ? Math.max(0, Math.min(100, Number(plan.discount_pct) || 0)) / 100 : 0;
  const memberPrice = (p) => Math.round((Number(p) || 0) * (1 - memberDisc) * 100) / 100;

  // Editing the cart invalidates any sent estimate's live mirror — clear it so we don't poll a stale token.
  const resetSent = () => { setLink(null); setToken(null); setLive(null); setSendMsg(null); };
  const add = (it) => { resetSent(); setCart((c) => c.find((x) => x.id === it.id) ? c : [...c, { id: it.id, name: it.name, price: it.price, soldPrice: it.price, min: it.minimum ?? null }]); };
  // A barcode-scanned service comes from the API (flat shape: minimum at top level, not it.internal).
  const addScanned = (it) => { resetSent(); setCart((c) => c.find((x) => x.id === it.id) ? c : [...c, { id: it.id, name: it.name, price: it.price, soldPrice: it.price, min: it.minimum ?? null }]); };
  const addTier = (tier) => { resetSent(); setTierKey(tier.key); setCart(() => tier.items.map((it) => ({ id: it.id, name: it.name, price: it.price, soldPrice: it.price, min: null }))); };
  const remove = (id) => setCart((c) => c.filter((x) => x.id !== id));
  const setPrice = (id, v) => setCart((c) => c.map((x) => x.id === id ? { ...x, soldPrice: v } : x));
  // Add an ad-hoc CUSTOM line — a job not in the catalog. It carries no catalog itemId (custom:true), sells
  // as a one-off line at the tech's quote, and creates/changes NO catalog price. Recorded separately so the
  // catalog can learn (recordCustomEntry). Unique client id so it isn't deduped against catalog items.
  const addCustom = (entry) => { setLink(null); setCart((c) => [...c, { id: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), custom: true, name: entry.name, description: entry.description || '', price: Number(entry.price) || 0, soldPrice: Number(entry.price) || 0, min: null }]); };

  // 🎫 Pre-load the item deep-linked from the catalog (?add=<id>) into the cart, exactly once. Then strip the
  // param so a refresh doesn't silently re-add (add()'s dedup makes a repeat harmless anyway).
  const seededRef = useRef(false);
  useEffect(() => {
    if (!preAdd || seededRef.current) return;
    seededRef.current = true;
    add(preAdd);
    if (typeof window !== 'undefined' && window.location.search.includes('add=')) {
      try { window.history.replaceState({}, '', `/job/${job.id}/pricebook`); } catch (_) {}
    }
  }, [preAdd]);

  // 📕🌊 Book scope — top-level roots ARE the books (Clog plumbing vs Flood Busterz). Default to the book that
  // matches THIS job's business unit, but never hard-lock: a one-tap switch covers the cross-sell job. Only
  // shows the picker when there's more than one book.
  const FLOOD_RE = /flood|water ?damage|mitigation|drying|restoration|content/i;
  const jobIsFlood = FLOOD_RE.test(`${job.business_unit || ''} ${job.job_type || ''} ${job.job_class || ''}`);
  const defaultBookId = useMemo(() => {
    if (!roots || roots.length <= 1) return 'all';
    const flood = roots.find((r) => FLOOD_RE.test(r.label || ''));
    const plumbing = roots.find((r) => !FLOOD_RE.test(r.label || ''));
    if (jobIsFlood && flood) return flood.id;
    if (!jobIsFlood && plumbing) return plumbing.id;
    return 'all';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roots, jobIsFlood]);
  const [bookId, setBookId] = useState(defaultBookId);
  const shownRoots = bookId === 'all' ? roots : (roots || []).filter((r) => r.id === bookId);

  const cartIds = useMemo(() => new Set(cart.map((l) => l.id)), [cart]);

  const listSubtotal = cart.reduce((s, l) => s + (Number(l.soldPrice) || 0), 0);
  const subtotal = memberDisc ? Math.round(listSubtotal * (1 - memberDisc) * 100) / 100 : listSubtotal;
  const memberSavings = Math.round((listSubtotal - subtotal) * 100) / 100;
  const cardFee = Math.round(subtotal * 0.04 * 100) / 100;
  const anyBelowMin = cart.some((l) => l.min != null && memberPrice(Number(l.soldPrice)) < l.min);
  // What actually gets sold/quoted — member price applied per line when member pricing is on. Custom lines
  // carry no catalog itemId (custom:true) + their own name/description so they survive into the estimate
  // snapshot as an ad-hoc line — they never touch job_pricebook_usage or any catalog price.
  const soldLines = () => cart.map((l) => l.custom
    ? { custom: true, name: l.name, description: l.description || '', quantity: 1, soldPrice: memberPrice(Number(l.soldPrice) || 0) }
    : { itemId: l.id, quantity: 1, soldPrice: memberPrice(Number(l.soldPrice) || 0) });

  const sell = () => start(async () => {
    setMsg(null); setApproval(null);
    const r = await recordSale(job.id, soldLines());
    if (r.ok) { setMsg(r.msg); setCart([]); router.refresh(); }
    else if (r.needsApproval) setApproval(r.msg);
    else setMsg(r.msg);
  });
  // The full Good/Better/Best ladder, customer-safe, so the BUYER sees the choice (not just the tech's pick).
  // Member discount is applied per line so each tier's customer price matches the cart. Prices are owner-set;
  // we only present them. Empty when no bundle/ladder exists for this job type → flat single-tier estimate.
  const ladderForSend = () => tiers.map((t) => ({
    key: t.key, name: t.name, bestFor: t.bestFor, pitch: t.bestFor, warranty: bundle?.warranty || '', recommended: !!t.recommended,
    lines: (t.items || []).map((it) => ({ itemId: it.id, quantity: it.qty || 1, soldPrice: memberPrice(Number(it.price) || 0) })),
  }));

  // Build a customer-safe estimate and get a shareable link (text it OR present on this iPad). When a ladder
  // exists we send all three tiers; `tierKey`/cart still seed the active/flat snapshot for backward-compat.
  // Build the customer-safe estimate, then HAND OFF to the Estimate tab — that's where the tech sends it,
  // watches the customer respond, and closes. The pricebook only builds; estimates finalize on Estimate.
  const present = () => start(async () => {
    setMsg(null);
    const r = await createEstimate(job.id, soldLines(), {
      tierKey, bundleSlug: bundle?.slug,
      tiers: tiers.length ? ladderForSend() : undefined,
      headline: (memberDisc && plan ? `${plan.name} member · ` : '') + (bundle ? bundle.name : (tierKey ? tierKey : '')),
    });
    if (r.ok) router.push(`/job/${job.id}/estimate`); else setMsg(r.msg);
  });
  const fullLink = link && typeof window !== 'undefined' ? window.location.origin + link : link;
  const copyLink = () => { try { navigator.clipboard.writeText(fullLink); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {} };

  // ── Send picker: text (consent-gated server-side) / email / present on this iPad. All point at the SAME token. ──
  const sendText = () => start(async () => { setSendMsg(null); const r = await sendEstimateText(token); setSendMsg({ ok: r.ok, text: r.msg }); });
  const sendEmail = () => start(async () => { setSendMsg(null); const r = await sendEstimateEmail(token); setSendMsg({ ok: r.ok, text: r.msg }); });
  const presentHere = () => start(async () => { setSendMsg(null); const r = await markPresented(token); if (r.ok && typeof window !== 'undefined') window.open(r.url, '_blank'); setSendMsg(r.ok ? { ok: true, text: 'Opened on this device — flip the iPad to the customer.' } : { ok: false, text: r.msg }); });

  // ── iPad LIVE MIRROR: poll the estimate status every 10s so the tech sees what the customer does on ANY
  // channel (texted phone, emailed laptop, or this iPad). Auto-stops once terminal (approved/declined). ──
  const liveRef = useRef(null); liveRef.current = live;
  useEffect(() => {
    if (!token) return;
    let alive = true;
    const tick = async () => {
      try { const s = await getEstimateStatus(token); if (alive && s && s.ok) setLive(s); } catch (_) {}
    };
    tick();
    const id = setInterval(() => { if (liveRef.current && liveRef.current.terminal) { clearInterval(id); return; } tick(); }, 10000);
    return () => { alive = false; clearInterval(id); };
  }, [token]);

  const input = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14 };

  return (
    <div style={{ marginTop: 10 }}>
      {/* ⭐ Member pricing toggle — turn on when offering a plan; pick the plan for its savings. (No tech/
          customer toggle — one clean view; flip to the customer with "Hand to Customer" or Present.) */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        {plans.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setMemberOn((v) => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, fontWeight: 800, border: '1px solid ' + (memberOn ? 'var(--green)' : 'var(--border)'), background: memberOn ? 'var(--green)' : 'var(--surface-2)', color: memberOn ? '#06210f' : 'var(--fg-2)' }}>
              ⭐ Member pricing {memberOn ? 'ON' : 'OFF'}
            </button>
            {memberOn && plans.length > 1 && (
              <select value={planSlug} onChange={(e) => setPlanSlug(e.target.value)} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '6px 9px', fontSize: 12.5 }}>
                {plans.map((p) => <option key={p.slug} value={p.slug}>{p.name} · {p.discount_pct}% off</option>)}
              </select>
            )}
            {memberOn && plan && plans.length <= 1 && <span style={{ fontSize: 11.5, color: 'var(--green)', fontWeight: 700 }}>{plan.name} · {plan.discount_pct}% off</span>}
          </div>
        )}
      </div>

      {/* GOOD / BETTER / BEST ladder — the clean checkout. */}
      {tiers.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {bundle?.customerDescription && <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{bundle.customerDescription}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {tiers.map((t) => {
              const st = TIER_STYLE[t.key] || TIER_STYLE.good;
              return (
                <div key={t.key} className={'card' + (t.recommended ? ' cb-recommend' : '')} style={{ borderColor: t.recommended ? 'var(--amber)' : 'var(--border)', borderWidth: t.recommended ? 2 : 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                  {t.recommended && <span style={{ position: 'absolute', top: -10, left: 12, background: 'var(--amber)', color: '#1a1a1a', fontSize: 9.5, fontWeight: 800, padding: '2px 8px', borderRadius: 20 }}>RECOMMENDED</span>}
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
        {/* The full pricebook, drill-down. Tap an item → "Add to estimate" drops it in the cart. Scan-a-part
            and Custom-item ride on top of the browse. Cost/margin shows to managers only. */}
        <CatalogBrowser
          embedded roots={shownRoots} related={related} upgrades={upgrades} total={total}
          showCost={showMargin} canEdit={false} recFor={(customer?.name || '').trim().split(/\s+/)[0] || ''}
          onAddItem={add} cartIds={cartIds}
          topSlot={<div style={{ marginBottom: 10 }}>
            {roots && roots.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {roots.map((r) => {
                  const on = bookId === r.id;
                  return <button key={r.id} type="button" onClick={() => setBookId(r.id)} className="pill" style={{ cursor: 'pointer', fontWeight: on ? 800 : 600, background: on ? 'var(--amber)' : 'var(--surface-2)', color: on ? '#1a1206' : 'var(--fg-2)', border: '1px solid var(--border)' }}>{r.icon} {r.label}</button>;
                })}
                <button type="button" onClick={() => setBookId('all')} className="pill" style={{ cursor: 'pointer', fontWeight: bookId === 'all' ? 800 : 600, background: bookId === 'all' ? 'var(--amber)' : 'var(--surface-2)', color: bookId === 'all' ? '#1a1206' : 'var(--fg-2)', border: '1px solid var(--border)' }}>All books</button>
              </div>
            )}
            {/* 3 ways to add: 📸 scan the part (match to the book) · 🔢 barcode · ➕ not in the book */}
            <PartPhotoScan onAdd={add} />
            <BarcodeScan onAdd={addScanned} />
            <CustomEntry jobId={job.id} onAdd={addCustom} />
          </div>}
        />

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
                    {showMargin && l.min != null && Number(l.soldPrice) < l.min && <div style={{ fontSize: 10, color: 'var(--red)' }}>below min {money(l.min)}</div>}
                  </div>
                  {showMargin
                    ? <input value={l.soldPrice} onChange={(e) => setPrice(l.id, e.target.value)} inputMode="decimal" style={{ ...input, width: 78, padding: '5px 7px', textAlign: 'right', fontSize: 12.5 }} />
                    : <span style={{ fontWeight: 700 }}>{money(l.soldPrice)}</span>}
                  <button onClick={() => remove(l.id)} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 15 }}>×</button>
                </div>
              ))}
            </div>

            {cart.length > 0 && (
              <div style={{ borderTop: '2px solid var(--amber-dim)', paddingTop: 8 }}>
                {memberDisc > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span className="muted">Regular price</span><span className="muted" style={{ textDecoration: 'line-through' }}>{money(listSubtotal)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--green)', fontWeight: 700 }}><span>⭐ {plan?.name} saves</span><span>−{money(memberSavings)}</span></div>
                  </>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span className="muted">{memberDisc > 0 ? 'Member subtotal' : 'Subtotal'}</span><strong>{money(subtotal)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}><span className="muted">Card fee if paid online</span><span className="muted">{money(cardFee)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, marginTop: 4 }}><strong>Customer pays</strong><strong style={{ color: 'var(--amber)' }}>{money(subtotal + cardFee)}</strong></div>
              </div>
            )}

            {approval && <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(239,83,80,.1)', border: '1px solid var(--red)', fontSize: 11.5, color: 'var(--red)' }}>🚦 {approval}</div>}
            {showMargin && anyBelowMin && !approval && <div className="muted" style={{ fontSize: 10.5, marginTop: 6, color: 'var(--amber)' }}>A line is below minimum — a manager must approve the discount.</div>}

            {/* ONE handoff — build here, present on the Estimate tab. */}
            <div style={{ marginTop: 12 }}>
              <button onClick={present} disabled={pending || cart.length === 0} className="btn" style={{ width: '100%', background: 'var(--amber)', borderColor: 'var(--amber)', color: '#1a1a1a', fontSize: 14, padding: '12px' }}>{pending ? 'Building…' : '🧾 Build estimate → present →'}</button>
              <div className="muted" style={{ fontSize: 10.5, marginTop: 6, textAlign: 'center' }}>Lands on the Estimate tab to send + close with the customer.</div>
            </div>
            {msg && <div style={{ fontSize: 11.5, marginTop: 8, color: 'var(--red)' }}>⚠ {msg}</div>}

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

// ➕ Custom item / not in the book — the tech types a name, what they did, a one-off PRICE for THIS job, and
// optional materials. "✨ Improve description" runs the AI coach (suggest-only): if vague it asks clarifying
// questions + offers a polished rewrite the tech can accept. On Add we record the entry for the catalog to
// learn from AND drop a custom line into the cart. The price is the tech's per-job quote — NOT a catalog
// price; this creates/changes no catalog item.
function CustomEntry({ jobId, onAdd }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [coaching, setCoaching] = useState(null);   // { needsDetail, questions[], cleanedName, cleanedDescription, suggestedCategory }
  const [accepted, setAccepted] = useState(null);   // the cleaned name/desc the tech accepted (carried to record)
  const [msg, setMsg] = useState(null);
  const [f, setF] = useState({ name: '', description: '', price: '', materials: '' });
  const upd = (k, v) => { setF((x) => ({ ...x, [k]: v })); if (k === 'name' || k === 'description') { setCoaching(null); setAccepted(null); } };

  const inp = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--fg-1)', borderRadius: 8, padding: '9px 11px', fontSize: 14, width: '100%' };

  const coach = async () => {
    setBusy(true); setMsg(null); setCoaching(null);
    const r = await coachCustomEntry(f.name, f.description);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, t: r.msg }); return; }
    setCoaching(r.coaching);
  };
  const acceptRewrite = () => {
    if (!coaching) return;
    setF((x) => ({ ...x, name: coaching.cleanedName || x.name, description: coaching.cleanedDescription || x.description }));
    setAccepted({ cleanedName: coaching.cleanedName || '', cleanedDescription: coaching.cleanedDescription || '', suggestedCategory: coaching.suggestedCategory || '' });
    setCoaching(null);
    setMsg({ ok: true, t: 'Rewrite accepted — review and add.' });
  };

  const submit = async () => {
    const name = f.name.trim();
    if (!name) { setMsg({ ok: false, t: 'Give it a name first.' }); return; }
    setBusy(true); setMsg(null);
    // Record for learning (server, suggest-only path). Soft-degrades if migration 126 isn't applied.
    const r = await recordCustomEntry({
      jobId, name, description: f.description, price: f.price, materials: f.materials,
      cleanedName: accepted?.cleanedName, cleanedDescription: accepted?.cleanedDescription, suggestedCategory: accepted?.suggestedCategory,
    });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, t: r.msg }); return; }
    // Drop the ad-hoc line into the cart regardless (the record may have soft-degraded with recorded:false).
    onAdd({ name, description: f.description, price: f.price });
    setF({ name: '', description: '', price: '', materials: '' });
    setCoaching(null); setAccepted(null); setOpen(false); setMsg(null);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="card" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', marginBottom: 10, borderColor: 'var(--amber-dim)', background: 'var(--surface-1)' }}>
        <span style={{ fontSize: 18 }}>➕</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--amber)' }}>Custom item / not in the book</div>
          <div className="muted" style={{ fontSize: 11.5 }}>Odd job? Type it, price it for this job, add it. The book learns from it.</div>
        </div>
      </button>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 10, borderColor: 'var(--amber-dim)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>➕ Custom line</span>
        <button onClick={() => { setOpen(false); setMsg(null); setCoaching(null); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>
      <input value={f.name} onChange={(e) => upd('name', e.target.value)} placeholder="What is it? e.g. Rebuild toilet" style={{ ...inp, marginBottom: 8 }} />
      <textarea value={f.description} onChange={(e) => upd('description', e.target.value)} placeholder="What did you do? (the more detail, the better the catalog learns)" rows={2} style={{ ...inp, marginBottom: 8, resize: 'vertical' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--fg-3)' }}>Your price for this job ($)
          <input value={f.price} onChange={(e) => upd('price', e.target.value)} inputMode="decimal" placeholder="0" style={{ ...inp, marginTop: 3 }} /></label>
        <label style={{ fontSize: 11, color: 'var(--fg-3)' }}>Materials used (optional)
          <input value={f.materials} onChange={(e) => upd('materials', e.target.value)} placeholder="e.g. flapper, fill valve" style={{ ...inp, marginTop: 3 }} /></label>
      </div>
      <div className="muted" style={{ fontSize: 10.5, marginBottom: 8 }}>This is your one-off quote for this job — it doesn't set a catalog price.</div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={coach} disabled={busy || (!f.name.trim() && !f.description.trim())} className="pill" style={{ cursor: 'pointer', color: 'var(--amber)', border: '1px solid var(--amber-dim)' }}>{busy ? '…' : '✨ Improve description'}</button>
        <button onClick={submit} disabled={busy || !f.name.trim()} className="btn" style={{ marginLeft: 'auto', background: 'var(--amber)', borderColor: 'var(--amber)', color: '#1a1a1a' }}>{busy ? 'Adding…' : '＋ Add to estimate'}</button>
      </div>

      {/* AI coach output — clarifying questions + a polished rewrite. Suggest-only; the tech accepts it. */}
      {coaching && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'var(--surface-1)', border: '1px solid var(--amber-dim)' }}>
          {coaching.needsDetail && coaching.questions.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', marginBottom: 4 }}>A few things that'd sharpen this:</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {coaching.questions.map((q, i) => <li key={i} style={{ fontSize: 12, marginBottom: 2 }}>{q}</li>)}
              </ul>
            </div>
          )}
          {(coaching.cleanedName || coaching.cleanedDescription) && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>Polished version:</div>
              {coaching.cleanedName && <div style={{ fontSize: 13, fontWeight: 700 }}>{coaching.cleanedName}</div>}
              {coaching.cleanedDescription && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{coaching.cleanedDescription}</div>}
              <button onClick={acceptRewrite} className="pill" style={{ cursor: 'pointer', marginTop: 8, color: 'var(--green)', border: '1px solid var(--green)' }}>✓ Use this wording</button>
            </div>
          )}
        </div>
      )}
      {msg && <div style={{ fontSize: 11.5, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.t}</div>}
    </div>
  );
}

// Live status mirror for the tech. Maps the polled estimate status → a glanceable line + the chosen tier.
function LiveStatus({ live, tiers = [] }) {
  const s = live.status || 'sent';
  const tierName = (() => {
    const k = live.selectedTierKey;
    if (!k) return null;
    const t = (tiers || []).find((x) => x.key === k);
    return t ? t.name : (k.charAt(0).toUpperCase() + k.slice(1));
  })();
  const MAP = {
    sent:              { icon: '📤', label: 'Sent — waiting for them to open', color: 'var(--fg-3)' },
    viewed:            { icon: '👀', label: 'Viewing now', color: 'var(--amber)' },
    question:          { icon: '💬', label: 'Asked a question — check the office queue', color: 'var(--amber)' },
    deposit_requested: { icon: '💳', label: 'Wants to put a deposit down', color: 'var(--amber)' },
    approved:          { icon: '✓', label: 'Accepted', color: 'var(--green)' },
    declined:          { icon: '✗', label: 'Declined', color: 'var(--red)' },
  };
  const m = MAP[s] || MAP.sent;
  const channelLabel = { text: 'by text', email: 'by email', ipad: 'on the iPad', in_person: 'in person', link: 'on their phone' }[live.approvalChannel] || '';
  return (
    <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--fg-3)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
        Live status {!live.terminal && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 1.4s infinite' }} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 17, color: m.color }}>{m.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: m.color }}>{m.label}{s === 'approved' && channelLabel ? ` ${channelLabel}` : ''}</div>
          {tierName && (s === 'approved' || s === 'viewed' || s === 'deposit_requested') && (
            <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 1 }}>Chose <strong style={{ color: 'var(--amber)' }}>{tierName}</strong>{live.approvedName ? ` · ${live.approvedName}` : ''}</div>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
    </div>
  );
}

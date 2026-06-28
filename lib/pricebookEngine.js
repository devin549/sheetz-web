// Sheetz Pricebook engine — pure helpers for the two-view (internal vs customer) sales model + margin math.
// Prices are DOLLARS (numeric) to match the pricebook schema, NOT cents like the rest of the app.
import { canAny } from '@/lib/roles';

export const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
export const money2 = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Role gates ───────────────────────────────────────────────────────────────────────────────────────
// Cost / margin / minimum / internal notes are owner/GM/OM/accounting only — NEVER techs unless allowed.
export const canSeeCost = (role) => canAny(role, ['seeFinancials']);
export const canEditPricebook = (role) => canAny(role, ['manageInventory', 'manageUsers', 'seeReports']);
export const canApprovePrice = (role) => canAny(role, ['manageUsers']);          // owner / admin / GM
export const canOverrideMinimum = (role) => canAny(role, ['manageUsers']);

// ── Editor gates (Phase 1 — split the merchandising layer from the price layer) ───────────────────────
// MERCHANDISING (name, customer copy, warranty, legal, photos/gallery/links, category, tags): owner, admin,
// gm, om AND marketing. Marketing lives here — but the price fields are LOCKED for them (see canMovePrice).
const r = (role) => String(role || '').toLowerCase();
export const canEditPricebookContent = (role) => ['owner', 'admin', 'gm', 'om', 'marketing'].includes(r(role));
// STRUCTURE (add/rename/move/reorder/archive categories): owner, admin, gm, om — NOT marketing.
export const canEditPricebookStructure = (role) => ['owner', 'admin', 'gm', 'om'].includes(r(role));
// PRICE-MOVER: ONLY the owner/admin writes a live price. Everyone else (incl. gm/om) routes through the
// owner-approve gate. Marketing never sees the price fields at all.
export const canMovePrice = (role) => ['owner', 'admin'].includes(r(role));
// Can SEE/EDIT price fields in the editor (gm/om edit → queues for owner approval; marketing = locked out).
export const canEditPriceFields = (role) => ['owner', 'admin', 'gm', 'om'].includes(r(role));

// ── Margin math (matches pricebook_margin_view: material-only margin) ─────────────────────────────────
export function marginPct(item) {
  const retail = Number(item?.retail_price) || 0;
  const cost = Number(item?.estimated_material_cost) || 0;
  if (retail <= 0) return null;
  return Math.round(((retail - cost) / retail) * 1000) / 10;
}
// The retail price that would hit a target material-margin % for a given cost. null if not computable.
export function priceForTargetMargin(cost, targetPct) {
  const c = Number(cost) || 0, t = Number(targetPct) || 0;
  if (c <= 0 || t <= 0 || t >= 100) return null;
  return Math.round((c / (1 - t / 100)) * 100) / 100; // (retail − cost)/retail = t%  →  retail = cost / (1 − t)
}

// Three-tier health (Devin): Healthy ≥ target · Thin within 10pts under · Danger well below / no price.
const THIN_BAND = 10;
export function marginHealth(item) {
  const retail = Number(item?.retail_price) || 0;
  if (retail <= 0) return 'missing_price';
  const m = marginPct(item);
  const target = Number(item?.target_margin_pct) || 0;
  if (m >= target) return 'healthy';
  if (m >= target - THIN_BAND) return 'thin';
  return 'danger';
}
export const HEALTH_META = {
  healthy: { label: 'Healthy', color: 'var(--green)' },
  thin: { label: 'Thin', color: 'var(--amber)' },
  danger: { label: 'Danger', color: 'var(--red)' },
  missing_price: { label: 'No price', color: 'var(--fg-3)' },
};

// Calm, tech-facing scripts for the common objections (tech taps a chip → reads this back).
export const OBJECTION_SCRIPTS = {
  too_expensive: { label: '💸 Too expensive', script: "Totally fair — let's look at what's driving it. The bigger option costs more up front but it's the one that stops this from happening again, so you're not paying twice. We also have financing that splits it into small monthly payments. Want me to show you that?" },
  need_spouse: { label: '🗣 Need spouse', script: "Of course — it's a real decision. I can text you this estimate right now so you both see the exact options and what's included. I'll hold today's pricing for you, and you can approve from your phone whenever you're both ready." },
  thinking: { label: '🤔 Thinking about it', script: "Makes sense. Quick thing while I'm here — the middle option is what most folks in your spot pick because it catches the cause, not just the symptom. If it's timing, I can lock this price and you approve later. What's the part you're weighing?" },
};
// A sale below the item's minimum price needs manager approval.
export function belowMinimum(item, soldPrice) {
  const min = item?.minimum_price == null ? null : Number(item.minimum_price);
  if (min == null) return false;
  return Number(soldPrice) < min;
}

// ── The two views ────────────────────────────────────────────────────────────────────────────────────
// Customer-safe projection — NEVER cost, margin, minimum, internal notes, vendor, or office language.
export function customerView(item) {
  return {
    id: item.id,
    name: item.customer_name || item.name,
    description: item.customer_description || item.short_description || '',
    price: Number(item.retail_price) || 0,
    warranty: item.warranty_text || '',
    photo: item.primary_photo_url || '',
    pdf: item.pdf_url || '',
    manufacturer: item.manufacturer || '',
    taxable: !!item.taxable,
  };
}
// Internal extras — only merge when canSeeCost(role). Keeps the customer object as the base everywhere.
export function internalExtras(item) {
  return {
    sku: item.sku,
    internalName: item.internal_name || item.name,
    internalNotes: item.internal_notes || '',
    cost: Number(item.estimated_material_cost) || 0,
    minimum: item.minimum_price == null ? null : Number(item.minimum_price),
    targetMargin: Number(item.target_margin_pct) || 0,
    marginPct: marginPct(item),
    marginHealth: marginHealth(item),
    laborHours: Number(item.estimated_labor_hours) || 0,
    requiresManagerApproval: !!item.requires_manager_approval,
    tags: item.tags || [],
  };
}
// Shape an item for a given role: customer fields always; internal fields only if the role may see cost.
export function shapeItem(item, role) {
  const base = customerView(item);
  return canSeeCost(role) ? { ...base, internal: internalExtras(item) } : base;
}

// ── Phase 2a — Margin & Profit Intelligence (pure math; unit-tested) ──────────────────────────────────

// Roll a service's confirmed/suggested learned parts (those with a vendor price) up to a suggested
// material cost: Σ(vendor_price × qty). Returns { cost, parts } where parts is the count that contributed.
// Pass includeSuggested=false to count only confirmed links. NaN/null prices are skipped, not zeroed-in.
export function rollupMaterialCost(links = [], { includeSuggested = true } = {}) {
  let cost = 0, parts = 0;
  for (const l of links) {
    const status = String(l?.status || '').toLowerCase();
    if (status === 'rejected') continue;
    if (!includeSuggested && status !== 'confirmed') continue;
    const vp = Number(l?.vendor_price);
    if (!(vp > 0)) continue; // no usable price → can't contribute
    const qty = Number(l?.quantity) > 0 ? Number(l.quantity) : 1;
    cost += vp * qty;
    parts += 1;
  }
  return { cost: Math.round(cost * 100) / 100, parts };
}

// Material guardrail: is material cost too large a slice of the ticket? Returns the ratio (0–1) and a flag.
// threshold is a PERCENT (e.g. 20 = 20%). Items with no cost or no price can't be judged → flagged=false.
export function materialPctOfTicket(retail, cost) {
  const r = Number(retail) || 0, c = Number(cost) || 0;
  if (r <= 0 || c <= 0) return null;
  return Math.round((c / r) * 1000) / 10; // one-decimal percent
}
export function exceedsMaterialThreshold(retail, cost, thresholdPct = 20) {
  const r = Number(retail) || 0, c = Number(cost) || 0;
  if (r <= 0 || c <= 0) return false;
  // Compare the RAW ratio (not the display-rounded pct) so a 20.04% item isn't masked by rounding to 20.0%.
  return (c / r) > (Number(thresholdPct) || 20) / 100;
}
// Lowest retail that pulls material back to ≤ threshold%:  cost / retail = t%  →  retail = cost / (t/100).
// Rounds UP to the nearest dollar so we never land a hair over the line. null if not computable.
export function priceForMaterialThreshold(cost, thresholdPct = 20) {
  const c = Number(cost) || 0, t = Number(thresholdPct) || 0;
  if (c <= 0 || t <= 0 || t >= 100) return null;
  return Math.ceil(c / (t / 100));
}

// Effective $/hr for a money-loser scan: avg sold ÷ avg hours. usedEstimate flags the labeled fallback.
export function effectiveHourly(avgSold, avgHours) {
  const s = Number(avgSold) || 0, h = Number(avgHours) || 0;
  if (h <= 0) return null;
  return Math.round((s / h) * 100) / 100;
}

// ── Good / Better / Best ladder ──────────────────────────────────────────────────────────────────────
// Build the three customer tiers from a bundle + its items. Each tier's price = sum of the retail prices
// of the items whose `tiers` array includes that tier key. Good ⊆ Better ⊆ Best by convention.
const TIER_KEYS = ['good', 'better', 'best'];
export function buildTiers(bundle, bundleItems = []) {
  if (!bundle) return [];
  const names = { good: bundle.good_option_name, better: bundle.better_option_name, best: bundle.best_option_name };
  const bestFor = { good: bundle.good_best_for, better: bundle.better_best_for, best: bundle.best_best_for };
  return TIER_KEYS.filter((k) => names[k]).map((key) => {
    const inTier = bundleItems.filter((bi) => (bi.tiers || []).includes(key));
    const price = inTier.reduce((s, bi) => s + (Number(bi.item?.retail_price) || 0) * (Number(bi.quantity) || 1), 0);
    return {
      key,
      name: names[key],
      bestFor: bestFor[key] || '',
      price,
      includes: inTier.map((bi) => bi.item?.customer_name || bi.item?.name).filter(Boolean),
      items: inTier.map((bi) => ({ id: bi.item?.id, name: bi.item?.customer_name || bi.item?.name, price: Number(bi.item?.retail_price) || 0, qty: Number(bi.quantity) || 1 })).filter((x) => x.id),
      recommended: key === 'better', // middle tier is the default nudge
    };
  });
}

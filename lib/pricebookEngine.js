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

// ── Margin math (matches pricebook_margin_view: material-only margin) ─────────────────────────────────
export function marginPct(item) {
  const retail = Number(item?.retail_price) || 0;
  const cost = Number(item?.estimated_material_cost) || 0;
  if (retail <= 0) return null;
  return Math.round(((retail - cost) / retail) * 1000) / 10;
}
export function marginHealth(item) {
  const retail = Number(item?.retail_price) || 0;
  if (retail <= 0) return 'missing_price';
  const m = marginPct(item);
  const target = Number(item?.target_margin_pct) || 0;
  return m < target ? 'below_target' : 'healthy';
}
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

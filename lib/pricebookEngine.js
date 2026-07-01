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
  // The owner can point the RECOMMENDED badge at any tier (sales-analyst fix: on a high-ticket bundle Best is
  // often the smart target, not the middle). Defaults to 'better' so nothing changes until an owner sets it.
  const recoKey = TIER_KEYS.includes(bundle.recommended_tier_key) ? bundle.recommended_tier_key : 'better';
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
      recommended: key === recoKey, // owner-chosen hero tier (defaults to the middle)
    };
  });
}

// ── Phase 2b-ii — Always-Learning Loop (pure, unit-tested) ────────────────────────────────────────────
// Techs type ad-hoc "custom" lines for jobs not in the catalog. We RECORD each one and, when the same kind
// of job recurs, surface it for the owner to promote into a real Master Task. These helpers do the
// normalize → group → frequency-detect, and parse the AI description-coach response. NO price logic here:
// the custom-line price is the tech's per-job quote and never becomes a catalog price.

// Normalize a custom-entry name into a grouping key: lowercase, strip punctuation, collapse whitespace.
// "Rebuild Toilet!!", "rebuild  toilet", "Rebuild a toilet." → all collapse toward the same bucket.
export function normalizeCustomKey(name) {
  return String(name == null ? '' : name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')   // punctuation → space
    .replace(/\s+/g, ' ')           // collapse runs of whitespace
    .trim();
}

// Group recorded custom entries by their normalized name and count frequency. Returns groups sorted by
// count (desc), each carrying: key, a display label (prefers the AI-cleaned name, else the most common raw
// name), the count, the raw entry ids, the latest cleaned description/category seen, and the price range.
// Robust to null/garbage rows. `minCount` drops one-offs from the review queue (default 1 = keep all).
export function groupCustomEntries(entries = [], { minCount = 1 } = {}) {
  const buckets = {};
  for (const e of (Array.isArray(entries) ? entries : [])) {
    if (!e || typeof e !== 'object') continue;
    // Group on the tech's RAW typed name — that's the recurring intent. The cleaned_name is display polish
    // that varies entry-to-entry, so it would wrongly split "rebuild toilet" from "Toilet Rebuild".
    const key = normalizeCustomKey(e.raw_name || e.cleaned_name);
    if (!key) continue; // nameless rows can't be grouped
    const b = buckets[key] || (buckets[key] = {
      key, count: 0, ids: [], rawNames: {}, cleanedName: null,
      cleanedDescription: null, suggestedCategory: null,
      minPrice: null, maxPrice: null, lastCreatedAt: null,
    });
    b.count += 1;
    if (e.id != null) b.ids.push(e.id);
    const raw = String(e.raw_name || '').trim();
    if (raw) b.rawNames[raw] = (b.rawNames[raw] || 0) + 1;
    // Prefer the most-recent AI-cleaned phrasing for the display + promote step.
    const created = e.created_at ? String(e.created_at) : '';
    if (!b.lastCreatedAt || created >= b.lastCreatedAt) {
      b.lastCreatedAt = created || b.lastCreatedAt;
      if (e.cleaned_name) b.cleanedName = String(e.cleaned_name).trim();
      if (e.cleaned_description) b.cleanedDescription = String(e.cleaned_description).trim();
      if (e.suggested_category) b.suggestedCategory = String(e.suggested_category).trim();
    }
    const price = Number(e.price);
    if (Number.isFinite(price) && price > 0) {
      b.minPrice = b.minPrice == null ? price : Math.min(b.minPrice, price);
      b.maxPrice = b.maxPrice == null ? price : Math.max(b.maxPrice, price);
    }
  }
  return Object.values(buckets)
    .map((b) => {
      // Display label: the AI-cleaned name if we have one, else the most-frequent raw name.
      const topRaw = Object.entries(b.rawNames).sort((a, c) => c[1] - a[1])[0];
      const { rawNames, ...rest } = b;
      return { ...rest, label: b.cleanedName || (topRaw ? topRaw[0] : b.key) };
    })
    .filter((b) => b.count >= (Number(minCount) || 1))
    .sort((a, b) => b.count - a.count || (b.lastCreatedAt || '').localeCompare(a.lastCreatedAt || ''));
}

// ── Phase 4 — Conversion analytics (pure, unit-tested) ────────────────────────────────────────────────
// Turn the estimate event log into the feedback loop: which tier / bundle / price actually gets the YES.
// READ-ONLY math — given a window of pricebook_estimates rows (+ their decline reasons + selected tiers),
// roll up the funnel, the tier mix, the avg approved ticket, the per-bundle close-rates, and the decline
// tally. Every rate guards divide-by-zero (→ null, the UI shows "—"). No row mutation; pure reduction.

// Safe integer-percent helper: round(100 * num / den) or null when den is 0/invalid (→ "—" in the UI).
export function safePct(num, den) {
  const n = Number(num) || 0, d = Number(den) || 0;
  if (d <= 0) return null;
  return Math.round((n / d) * 100);
}

const APPROVED = new Set(['approved']);
// Known statuses that mean the customer opened the link (all the real states past 'sent'). We gate "viewed"
// on this allowlist rather than "any non-sent string" so a garbage/out-of-enum status can't inflate views.
const PAST_SENT = new Set(['viewed', 'approved', 'declined', 'question', 'deposit_requested']);
const TIER_MIX_KEYS = ['good', 'better', 'best'];

// Aggregate a window of estimate rows. Each row: { status, selected_tier_key|tier_key, subtotal,
// bundle_slug, decline_reason }. Tolerates missing fields / garbage rows — never throws, never NaN/Infinity.
export function aggregateConversion(estimates = []) {
  const rows = Array.isArray(estimates) ? estimates : [];

  // 1. Funnel — sent is the denominator (every row is a sent estimate). Viewed = anyone who got past 'sent'
  //    (viewed/approved/declined/question/deposit all imply the link was opened). Approved = the YES.
  let total = 0, viewed = 0, approved = 0, declined = 0;

  // 2. Tier mix — of APPROVED estimates that carried a tier choice.
  const tierMix = { good: 0, better: 0, best: 0 };
  let tierMixTotal = 0;

  // 3. Approved ticket totals.
  let approvedRevenue = 0;

  // 4. By bundle.
  const bundles = {}; // slug → { sent, approved, revenue }

  // 5. Decline reasons.
  const declineReasons = {}; // reason → count

  for (const e of rows) {
    if (!e || typeof e !== 'object') continue;
    total += 1;
    const status = String(e.status || '').toLowerCase();
    const isApproved = APPROVED.has(status);
    // A row counts as "viewed" if its status is a known state past 'sent' — any real response means the link
    // was opened. Allowlisted (not "any non-sent") so a garbage status can't inflate the view denominator.
    if (PAST_SENT.has(status)) viewed += 1;
    if (status === 'declined') declined += 1;

    const slug = (e.bundle_slug == null || e.bundle_slug === '') ? '(no bundle)' : String(e.bundle_slug);
    const b = bundles[slug] || (bundles[slug] = { slug, sent: 0, approved: 0, revenue: 0 });
    b.sent += 1;

    if (isApproved) {
      approved += 1;
      const sub = Number(e.subtotal);
      const amt = Number.isFinite(sub) && sub > 0 ? sub : 0;
      approvedRevenue += amt;
      b.approved += 1;
      b.revenue += amt;
      // tier mix — prefer the customer's chosen tier (selected_tier_key), fall back to the pre-picked tier_key.
      const tk = String(e.selected_tier_key || e.tier_key || '').toLowerCase();
      if (TIER_MIX_KEYS.includes(tk)) { tierMix[tk] += 1; tierMixTotal += 1; }
    }

    if (status === 'declined') {
      const reason = (e.decline_reason == null || String(e.decline_reason).trim() === '')
        ? '(no reason given)' : String(e.decline_reason).trim().slice(0, 120);
      declineReasons[reason] = (declineReasons[reason] || 0) + 1;
    }
  }

  // Funnel rates (guarded).
  const viewRate = safePct(viewed, total);              // viewed ÷ sent
  const closeRateOfViewed = safePct(approved, viewed);  // approved ÷ viewed (the true close rate)
  const closeRateOfSent = safePct(approved, total);     // approved ÷ sent (end-to-end)

  // Tier mix percentages (of approved-with-tier).
  const tierMixPct = {
    good: safePct(tierMix.good, tierMixTotal),
    better: safePct(tierMix.better, tierMixTotal),
    best: safePct(tierMix.best, tierMixTotal),
  };

  // Avg approved ticket.
  const avgTicket = approved > 0 ? Math.round(approvedRevenue / approved) : null;

  // By-bundle rollup — close-rate + avg ticket per bundle, sorted by volume (sent) desc.
  const byBundle = Object.values(bundles).map((b) => ({
    slug: b.slug,
    sent: b.sent,
    approved: b.approved,
    closeRate: safePct(b.approved, b.sent),
    avgTicket: b.approved > 0 ? Math.round(b.revenue / b.approved) : null,
    revenue: Math.round(b.revenue),
  })).sort((a, b) => (b.sent - a.sent) || (b.approved - a.approved) || a.slug.localeCompare(b.slug));

  // Decline reasons — tally desc.
  const declines = Object.entries(declineReasons)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

  return {
    funnel: { sent: total, viewed, approved, declined, viewRate, closeRateOfViewed, closeRateOfSent },
    tierMix: { counts: { ...tierMix }, total: tierMixTotal, pct: tierMixPct },
    ticket: { approvedCount: approved, totalRevenue: Math.round(approvedRevenue), avgTicket },
    byBundle,
    declines,
    isEmpty: total === 0,
  };
}

// Parse the AI description-coach reply into a safe shape. Tolerates a parsed object, a JSON string, fenced
// JSON, or total garbage — never throws. Shape: { needsDetail, questions[], cleanedName, cleanedDescription }.
export function parseCoachResponse(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    const stripped = raw.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    try { obj = JSON.parse(stripped); } catch (_) { obj = null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { needsDetail: false, questions: [], cleanedName: '', cleanedDescription: '', suggestedCategory: '' };
  }
  const questions = Array.isArray(obj.questions)
    ? obj.questions.map((q) => String(q == null ? '' : q).trim()).filter(Boolean).slice(0, 6)
    : [];
  return {
    needsDetail: obj.needsDetail === true || obj.needs_detail === true,
    questions,
    cleanedName: String(obj.cleanedName || obj.cleaned_name || '').trim().slice(0, 120),
    cleanedDescription: String(obj.cleanedDescription || obj.cleaned_description || '').trim().slice(0, 600),
    suggestedCategory: String(obj.suggestedCategory || obj.suggested_category || '').trim().slice(0, 80),
  };
}

// Price book / Good-Better-Best engine — ported VERBATIM from the live CB Dispatch price book
// (Dispatch_Sheet/CB_Dispatch_PriceBook_v1.js, the pure substrate). Same math, same invariants:
//   • A proposal is up to 3 priced tiers (good/better/best) for one job.
//   • Member pricing honored; recommended defaults to the MIDDLE tier; each tier carries the
//     "step up for +$X" delta to the next tier up.
//   • SELECTING a tier NEVER charges — it records the accepted tier + returns an estimate handoff
//     for a human to invoice + collect separately. Statuses never include 'paid'.
// Keep in sync with the Apps Script version. "now" is passed in (no Date.now() inside the math).

export const ITEM_KINDS = ['part', 'labor', 'flat', 'fee'];
export const TIER_KEYS = ['good', 'better', 'best'];
export const PROPOSAL_STATUSES = ['draft', 'presented', 'accepted', 'declined', 'expired']; // never 'paid'

const str = (s) => String(s == null ? '' : s).trim();
const low = (s) => str(s).toLowerCase();
const num = (n) => Number(n) || 0;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const bool = (v) => v === true || v === 'true' || v === 1 || v === '1' || v === 'yes';

function normItem(item) {
  item = item || {};
  let kind = low(item.kind);
  if (ITEM_KINDS.indexOf(kind) < 0) kind = 'part';
  const unit = round2(item.unitPrice);
  const hasMember = item.memberPrice !== undefined && item.memberPrice !== null && item.memberPrice !== '';
  let member = hasMember ? round2(item.memberPrice) : unit;
  if (member > unit) member = unit;
  return {
    code: str(item.code), name: str(item.name), kind,
    qty: Math.max(0, num(item.qty == null ? 1 : item.qty)),
    unitPrice: unit, memberPrice: member,
    taxable: item.taxable === undefined ? (kind === 'part') : bool(item.taxable),
  };
}
const isBlankItem = (it) => !it.code && !it.name;
const lineList = (it) => round2(it.qty * it.unitPrice);
const lineMember = (it) => round2(it.qty * it.memberPrice);

function buildTier(tierInput, idx) {
  tierInput = tierInput || {};
  let key = low(tierInput.key);
  if (TIER_KEYS.indexOf(key) < 0) key = TIER_KEYS[idx] || ('tier' + (idx + 1));
  const items = (tierInput.items || []).map(normItem).filter((it) => !isBlankItem(it));
  let listSubtotal = 0, memberSubtotal = 0, taxableList = 0, taxableMember = 0;
  items.forEach((it) => {
    const l = lineList(it), m = lineMember(it);
    listSubtotal += l; memberSubtotal += m;
    if (it.taxable) { taxableList += l; taxableMember += m; }
  });
  return {
    key, label: str(tierInput.label) || (key.charAt(0).toUpperCase() + key.slice(1)),
    pitch: str(tierInput.pitch), warranty: str(tierInput.warranty), recommended: bool(tierInput.recommended),
    items, itemCount: items.length,
    listSubtotal: round2(listSubtotal), memberSubtotal: round2(memberSubtotal),
    taxableList: round2(taxableList), taxableMember: round2(taxableMember),
    savingsVsList: round2(listSubtotal - memberSubtotal),
  };
}

function priceTier(tier, taxRate, isMember) {
  const subtotal = isMember ? tier.memberSubtotal : tier.listSubtotal;
  const taxable = isMember ? tier.taxableMember : tier.taxableList;
  const tax = round2(taxable * taxRate);
  return {
    key: tier.key, label: tier.label, pitch: tier.pitch, warranty: tier.warranty, recommended: tier.recommended,
    items: tier.items, itemCount: tier.itemCount,
    listSubtotal: tier.listSubtotal, memberSubtotal: tier.memberSubtotal,
    subtotal: round2(subtotal), tax, total: round2(subtotal + tax),
    memberSavings: isMember ? tier.savingsVsList : 0,
  };
}

// Build a full priced proposal. opts: { nowISO, proposalId }.
export function buildProposal(input, opts) {
  input = input || {}; opts = opts || {};
  if (!opts.nowISO) throw new Error('buildProposal requires opts.nowISO');
  const taxRate = num(input.taxRate);
  const isMember = bool(input.isMember);

  const rawTiers = (input.tiers || []).map(buildTier).filter((t) => t.itemCount > 0);
  if (!rawTiers.length) throw new Error('buildProposal needs at least one non-empty tier');

  const priced = rawTiers.map((t) => priceTier(t, taxRate, isMember));

  let recIdx = -1;
  priced.forEach((t, i) => { if (t.recommended && recIdx < 0) recIdx = i; });
  if (recIdx < 0) recIdx = priced.length === 1 ? 0 : Math.floor((priced.length - 1) / 2); // default = MIDDLE tier
  priced.forEach((t, i) => { t.recommended = (i === recIdx); });

  const byPrice = priced.slice().sort((a, b) => a.total - b.total);
  for (let i = 0; i < byPrice.length; i++) {
    const up = byPrice[i + 1];
    byPrice[i].upgradeTo = up ? { key: up.key, label: up.label, delta: round2(up.total - byPrice[i].total) } : null;
  }

  return {
    proposalId: str(opts.proposalId), jobId: str(input.jobId), customer: str(input.customer),
    isMember, taxRate, status: 'draft', recommendedKey: priced[recIdx].key, selectedKey: '',
    tiers: priced, createdISO: str(opts.nowISO), updatedISO: str(opts.nowISO),
  };
}

const findTier = (proposal, key) => (proposal.tiers || []).find((t) => low(t.key) === low(key)) || null;

// Record the customer's choice. NEVER charges — returns an estimate handoff for a human to invoice.
export function selectTier(proposal, key, opts) {
  opts = opts || {};
  if (!opts.nowISO) throw new Error('selectTier requires opts.nowISO');
  if (['accepted', 'declined', 'expired'].includes(proposal.status)) return { ok: false, error: 'already_resolved', status: proposal.status };
  const tier = findTier(proposal, key);
  if (!tier) return { ok: false, error: 'unknown_tier', status: proposal.status };
  proposal.selectedKey = tier.key; proposal.status = 'accepted'; proposal.updatedISO = str(opts.nowISO);
  return { ok: true, status: 'accepted', selectedKey: tier.key, acceptedTotal: tier.total, estimate: { jobId: proposal.jobId, customer: proposal.customer, tier: tier.key, amount: tier.total, items: tier.items } };
}

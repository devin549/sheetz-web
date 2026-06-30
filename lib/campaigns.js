// Mass-email access model + audience presets. Two separated duties (the non-negotiable
// guardrail from the zero-value-payroll incident): whoever DRAFTS a campaign is not the same
// gate as whoever APPROVES + sends it. Compose is broad (office/marketing/sales); the Send
// button is locked to an internal approver (owner / GM / Tracey-OM / Ashley-accounting).
import { can } from '@/lib/roles';

// Internal approvers — the only seats that may release a blast to real customers.
export const APPROVER_ROLES = ['owner', 'admin', 'gm', 'om', 'accounting'];

export function canCompose(role) { return can(role, 'contactCustomer') && can(role, 'seeReports'); }
export function canApprove(role) { return APPROVER_ROLES.includes(String(role || '').toLowerCase()); }
export function canUseCampaigns(role) { return canCompose(role) || canApprove(role); }

// Audience presets — what list a campaign targets. Resolved server-side (resolveAudience in
// actions.js) against live invoices/customers; do_not_mail + empty emails are always skipped.
// Aging water heaters (9+ yrs, from scanned data plates) → fuel-targeted replacement campaigns.
export const WH_AGE_YEARS = 9;
export const AUDIENCES = [
  { key: 'pastdue',     label: 'Past-due customers', desc: 'Anyone with an open (unpaid) invoice' },
  { key: 'pastdue90',   label: 'Seriously past due (90+ days)', desc: 'Open invoices over 90 days old' },
  { key: 'allcustomers', label: 'All customers (with an email)', desc: 'Everyone on file we’re allowed to email' },
  { key: 'wh_gas',      label: `🔥 Gas water heaters · ${WH_AGE_YEARS}+ yrs`, desc: 'Aging GAS units on file — pitch power-vent or tankless' },
  { key: 'wh_electric', label: `⚡ Electric water heaters · ${WH_AGE_YEARS}+ yrs`, desc: 'Aging ELECTRIC units — pitch a hybrid heat-pump' },
  { key: 'wh_propane',  label: `🛢 Propane water heaters · ${WH_AGE_YEARS}+ yrs`, desc: 'Aging PROPANE/LP units — pitch tankless / high-efficiency' },
];
export const AUDIENCE_KEYS = AUDIENCES.map((a) => a.key);
export const audienceLabel = (key) => (AUDIENCES.find((a) => a.key === key) || {}).label || key;

// Recommended pitch per fuel (Devin's mapping) — used as the default brief when the office doesn't write one.
const AUDIENCE_BRIEF = {
  wh_gas: `These customers have a GAS water heater ${WH_AGE_YEARS}+ years old (most last ~10-12 yrs). Nudge them to replace it BEFORE it fails and floods. Offer the upgrade options: a high-efficiency power-vent gas unit, or going TANKLESS (endless hot water, saves space, lower bills). Include a limited-time replacement coupon and a free in-home assessment. Warm and helpful, not pushy.`,
  wh_electric: `These customers have an ELECTRIC water heater ${WH_AGE_YEARS}+ years old. Nudge them to replace it before it fails. Pitch a HYBRID heat-pump water heater — it can cut the water-heating part of their electric bill by more than half and may qualify for rebates/tax credits. Include a replacement coupon + a free assessment.`,
  wh_propane: `These customers have a PROPANE/LP water heater ${WH_AGE_YEARS}+ years old. Nudge them to replace it before it fails. Pitch going TANKLESS for endless hot water and big efficiency gains, or a high-efficiency replacement. Include a replacement coupon + a free assessment.`,
};
export const audienceBrief = (key) => AUDIENCE_BRIEF[key] || '';

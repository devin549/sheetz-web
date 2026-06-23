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
export const AUDIENCES = [
  { key: 'pastdue',     label: 'Past-due customers', desc: 'Anyone with an open (unpaid) invoice' },
  { key: 'pastdue90',   label: 'Seriously past due (90+ days)', desc: 'Open invoices over 90 days old' },
  { key: 'allcustomers', label: 'All customers (with an email)', desc: 'Everyone on file we’re allowed to email' },
];
export const AUDIENCE_KEYS = AUDIENCES.map((a) => a.key);
export const audienceLabel = (key) => (AUDIENCES.find((a) => a.key === key) || {}).label || key;

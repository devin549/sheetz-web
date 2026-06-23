// Plunger Pete access model + call purposes. Like mass email, AI-calling a real customer is an
// external send — the guardrail is enforced in code: anyone in PETE_USER_ROLES can QUEUE a call and
// freely place TEST calls (internal allowlist only); a REAL customer call must be released by an
// internal APPROVER. See actions.js.
import { APPROVER_ROLES } from '@/lib/campaigns';

// Office / financial / dispatch seats that may queue Pete calls (no field techs/viewers/customers).
export const PETE_USER_ROLES = ['owner', 'admin', 'gm', 'om', 'accounting', 'dispatcher', 'csr', 'sales', 'marketing', 'fs'];

export function canUsePete(role) { return PETE_USER_ROLES.includes(String(role || '').toLowerCase()); }
export function canApprovePete(role) { return APPROVER_ROLES.includes(String(role || '').toLowerCase()); }

export const PURPOSES = [
  { key: 'collections', label: 'Collections', desc: 'Past-due balance reminder + offer to set up a payment plan' },
  { key: 'warranty',    label: 'Warranty follow-up', desc: 'Check in on a warranty claim or a just-completed job' },
  { key: 'followup',    label: 'Missed-lead follow-up', desc: 'Reach a lead we never connected with' },
];
export const PURPOSE_KEYS = PURPOSES.map((p) => p.key);
export const purposeLabel = (k) => (PURPOSES.find((p) => p.key === k) || {}).label || k;

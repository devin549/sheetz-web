import { can } from './roles';

// Who can place/lift a credit hold AND book a held customer (the approver): owner / GM / accounting.
// Dispatch + CSR can see the hold but must get approval — that's the "no new work without terms" guardrail.
export function canOverrideCreditHold(role) {
  return can(role, 'seeFinancials') || can(role, 'manageUsers');
}

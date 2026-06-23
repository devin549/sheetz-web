// Sidebar nav — visibility is driven by the canonical permission model in lib/roles.js,
// NOT by ad-hoc role lists. Each item asks a question about what the role can DO, so adding
// a new role (or a new screen) just works without editing every page.

import { can, canAny } from '@/lib/roles';
import { canUseCampaigns } from '@/lib/campaigns';
import { canUsePete } from '@/lib/pete';

// Field seats that work a truck / day in the field (for screens with no clean perm key).
const FIELD = ['owner', 'admin', 'tech', 'foreman', 'fs'];
const isField = (role) => FIELD.includes(String(role || '').toLowerCase());

export const NAV = [
  { href: '/',          label: 'Home',      icon: '🏠', show: () => true },
  // Dispatch board = office/dispatch seats that run the queue or assign jobs.
  { href: '/board',     label: 'Board',     icon: '🗂️', show: (r) => canAny(r, ['seeQueue', 'assignJobs']) },
  // My Day = anyone who works jobs day-of: their own, their crew, or all.
  { href: '/my-day',    label: 'My Day',    icon: '📋', show: (r) => canAny(r, ['seeOwnOnly', 'seeCrew', 'seeAllJobs']) },
  // Field stock + tools — field seats + shop.
  { href: '/my-truck',  label: 'My Truck',  icon: '🚐', show: (r) => isField(r) || r === 'shop' },
  // Shop = inventory/reorder seat (or owner).
  { href: '/shop',      label: 'Shop',      icon: '🏪', show: (r) => can(r, 'manageInventory') || r === 'owner' || r === 'admin' },
  // Customer book — office seats that book/contact + see the full board (not field-only techs).
  { href: '/customers', label: 'Customers', icon: '🔎', show: (r) => can(r, 'seeAllJobs') && (can(r, 'contactCustomer') || can(r, 'seeReports')) },
  // Money — only seats that can see financials.
  { href: '/past-due',  label: 'Past Due',  icon: '💰', show: (r) => can(r, 'seeFinancials') },
  // Mass email — compose seats (office/marketing/sales) + approvers. Send is approver-gated.
  { href: '/campaigns', label: 'Mass Email', icon: '📣', show: (r) => canUseCampaigns(r) },
  // Plunger Pete — AI calling. Queue is broad office; real customer calls are approver-gated.
  { href: '/pete',      label: 'Plunger Pete', icon: '📞', show: (r) => canUsePete(r) },
  // Team — add hires + set positions. Only seats that can manage users.
  { href: '/team',      label: 'Team',      icon: '🧑‍✈️', show: (r) => can(r, 'manageUsers') },
  // Account — change your own password. Everyone.
  { href: '/account',   label: 'Account',   icon: '🔐', show: () => true },
  // dispatch board, booking, etc. get added here (perm-gated) as they're ported.
];

// A user's role id lives in user_metadata.role. Unknown/unprovisioned → 'viewer' (look, don't
// touch) — the safe default the board uses, never a privileged one.
export function roleOf(user) {
  return (user && user.user_metadata && user.user_metadata.role) || 'viewer';
}

export function navFor(role) {
  return NAV.filter((n) => n.show(role));
}

export function canSee(href, role) {
  const item = NAV.find((n) => n.href === href);
  return item ? item.show(role) : true;
}

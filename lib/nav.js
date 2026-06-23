// Single source of truth for the sidebar nav + who sees what.
// Roles: 'owner' (sees everything), 'office' (dispatch/CSR — customers, money, board, booking),
// 'tech' (field screens). A user's role lives in their Supabase user_metadata.role.

export const NAV = [
  { href: '/',          label: 'Home',      icon: '🏠', roles: ['owner', 'office', 'tech'] },
  { href: '/my-day',    label: 'My Day',    icon: '📋', roles: ['owner', 'tech'] },
  { href: '/my-truck',  label: 'My Truck',  icon: '🚐', roles: ['owner', 'tech'] },
  { href: '/customers', label: 'Customers', icon: '🔎', roles: ['owner', 'office'] },
  { href: '/past-due',  label: 'Past Due',  icon: '💰', roles: ['owner', 'office'] },
  // dispatch board, booking, etc. get added here (role-gated) as they're ported.
];

export function roleOf(user) {
  return (user && user.user_metadata && user.user_metadata.role) || 'tech';
}

export function navFor(role) {
  return NAV.filter((n) => n.roles.includes(role));
}

export function canSee(href, role) {
  const item = NAV.find((n) => n.href === href);
  return item ? item.roles.includes(role) : true;
}

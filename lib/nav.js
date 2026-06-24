// Grouped, role-aware navigation — ported from the live Dispatch board's CB_NAV_LAYOUT
// (Dispatch_Sheet/CB_Dispatch_BoardWebApp_v1.js). Each role gets the SAME cockpit structure the
// sheets give them: pinned items on top, then collapsible groups (Follow Up, Customers, Accounting,
// Field Ops, Sales & Marketing, My Work, Reports & Tasks, Setup).
//
// Items that map to a built web route are `live` and link through; everything else is `porting`
// and points at /soon (an honest "coming from the sheets" placeholder) so the cockpit is complete
// and you can see exactly what's live vs. on the way.
//
// Visibility is gated per pinned-item and per GROUP via canonical roles (owner/admin/gm see all).
// Icons are string keys; the Sidebar maps them to lucide components.

import { can } from '@/lib/roles';

// key → built route. Anything not here renders as a /soon placeholder.
const LIVE = {
  home: '/', board: '/board', myDay: '/my-day', qa: '/supervisor/jobs', pete: '/pete', hank: '/hank',
  customers: '/customers', pastDue: '/past-due', receivables: '/past-due', arBowl: '/past-due', invoices: '/invoices',
  photoReview: '/supervisor/jobs', openEstimates: '/estimate', priceBook: '/estimate', marketing: '/campaigns',
  shopCounter: '/shop', inventory: '/shop', shopDash: '/shop', fleet: '/my-truck', teams: '/team', account: '/account',
  // Field Ops + Reports screens (live with real data)
  staffScore: '/scorecard', techPerf: '/scorecard', crewRoles: '/crews', helperAssign: '/crews', crewTeams: '/crews',
  jobRecords: '/job-records', booking: '/booking', paymentLedger: '/payments', cancelInsights: '/cancel-insights',
  topCustomers: '/top-customers',
};
const hrefFor = (it) => LIVE[it.key] || `/soon?screen=${encodeURIComponent(it.label)}`;
const statusFor = (it) => (LIVE[it.key] ? 'live' : 'porting');

// owner/admin/gm are the full-trust tier — they see everything.
const ALL_ACCESS = ['owner', 'admin', 'gm'];
const roleOk = (roles, role) => {
  const r = String(role || '').toLowerCase();
  return ALL_ACCESS.includes(r) || (roles || []).includes(r);
};

// ── Pinned (top of the rail) ──────────────────────────────────────────────────
const PINNED = [
  { key: 'home', label: 'Home', icon: 'home', roles: ['*'] },
  { key: 'board', label: 'Dispatch Board', icon: 'truck', roles: ['dispatcher', 'csr', 'om', 'fs', 'foreman', 'accounting', 'marketing', 'sales', 'viewer'] },
  { key: 'booking', label: 'Job Booking', icon: 'phone', roles: ['dispatcher', 'csr', 'om', 'marketing', 'sales', 'fs', 'foreman'] },
  { key: 'myDay', label: 'My Day', icon: 'calendar', roles: ['tech', 'helper', 'fs', 'foreman'] },
  { key: 'qa', label: 'QA / Closeouts', icon: 'clipboardCheck', roles: ['fs', 'foreman'] },
  { key: 'pete', label: 'Plunger Pete', icon: 'phone', roles: ['dispatcher', 'csr', 'om', 'accounting', 'marketing', 'sales'] },
  { key: 'hank', label: 'Hank', icon: 'sparkles', roles: ['dispatcher', 'csr', 'om', 'fs', 'foreman', 'accounting', 'marketing', 'sales', 'tech'] },
];

// ── Groups (collapsible) ─────────────────────────────────────────────────────
const GROUPS = [
  {
    id: 'followup', title: 'Follow Up', icon: 'phone', roles: ['dispatcher', 'csr', 'om', 'accounting', 'marketing', 'sales'],
    items: [
      { key: 'messages', label: 'Messages', icon: 'phone' },
      { key: 'openEstimates', label: 'Open Estimates', icon: 'star' },
      { key: 'reminderQueue', label: 'Appt Reminders', icon: 'phone' },
      { key: 'activePromises', label: 'Active Promises', icon: 'phone' },
      { key: 'customerHeat', label: 'Customer Heat', icon: 'alert' },
      { key: 'cancelInsights', label: 'Cancel Insights', icon: 'alert' },
      { key: 'savesToday', label: 'Saves Today', icon: 'star' },
    ],
  },
  {
    id: 'customers', title: 'Customers', icon: 'users', roles: ['dispatcher', 'csr', 'om', 'accounting', 'sales'],
    items: [
      { key: 'customers', label: 'Customers', icon: 'users' },
      { key: 'topCustomers', label: 'Top Customers', icon: 'star' },
      { key: 'accounts', label: 'Customer Accounts', icon: 'users' },
      { key: 'memberships', label: 'Memberships', icon: 'star' },
      { key: 'pastDue', label: 'Past Due', icon: 'alert' },
      { key: 'receivables', label: 'Who Owes Us', icon: 'star' },
      { key: 'invoices', label: 'Invoices', icon: 'list' },
      { key: 'paymentLinks', label: 'Payment Links', icon: 'list' },
    ],
  },
  {
    id: 'accounting', title: 'Accounting', icon: 'star', roles: ['accounting', 'om'],
    items: [
      { key: 'arBowl', label: 'AR Command Center', icon: 'alert' },
      { key: 'bankPosition', label: 'Bank Position', icon: 'star' },
      { key: 'payrollRun', label: 'Payroll Run', icon: 'star' },
      { key: 'pendingPay', label: 'Pending Payrolls', icon: 'star' },
      { key: 'receiptInbox', label: 'Receipt Inbox', icon: 'list' },
      { key: 'dailyVerify', label: 'Daily Verification', icon: 'check' },
      { key: 'docFraud', label: 'Doc Fraud Review', icon: 'alert' },
      { key: 'cashCustody', label: 'Cash Custody', icon: 'flag' },
      { key: 'profitTruth', label: 'Profit Breakdown', icon: 'star' },
      { key: 'jobPL', label: 'Job P&L', icon: 'star' },
      { key: 'paymentLedger', label: 'Payment Ledger', icon: 'list' },
      { key: 'creditCards', label: 'Credit Cards', icon: 'list' },
    ],
  },
  {
    id: 'fieldops', title: 'Field Ops', icon: 'truck', roles: ['om', 'fs', 'foreman', 'dispatcher', 'shop'],
    items: [
      { key: 'techPerf', label: 'Tech Performance', icon: 'users' },
      { key: 'staffScore', label: 'Staff Scorecard', icon: 'users' },
      { key: 'crownAwards', label: 'Crown / Plunger', icon: 'star' },
      { key: 'helperAssign', label: 'Helpers', icon: 'users' },
      { key: 'crewRoles', label: 'Crew Roles', icon: 'users' },
      { key: 'crewTeams', label: 'Manage Teams', icon: 'users' },
      { key: 'inventory', label: 'Shop Inventory', icon: 'list' },
      { key: 'purchaseOrders', label: 'Purchase Orders', icon: 'list' },
      { key: 'toolCheckout', label: 'Tool Check-Out', icon: 'check' },
      { key: 'shopCounter', label: 'Shop Counter', icon: 'list' },
      { key: 'fleet', label: 'Fleet', icon: 'truck' },
    ],
  },
  {
    id: 'growth', title: 'Sales & Marketing', icon: 'flame', roles: ['sales', 'marketing'],
    items: [
      { key: 'thePit', label: 'The Pit', icon: 'star' },
      { key: 'sellingOpps', label: 'Selling Opps', icon: 'star' },
      { key: 'sales', label: 'Sales Board', icon: 'star' },
      { key: 'priceBook', label: 'Price Book', icon: 'star' },
      { key: 'growth', label: 'Growth & Intel', icon: 'flame' },
      { key: 'marketing', label: 'Marketing', icon: 'flame' },
      { key: 'vegas', label: 'Vegas Awards', icon: 'star' },
    ],
  },
  {
    id: 'mywork', title: 'My Work', icon: 'calendar', roles: ['tech', 'helper', 'fs', 'foreman'],
    items: [
      { key: 'myDay', label: 'My Day', icon: 'calendar' },
      { key: 'myPay', label: 'My Pay', icon: 'star' },
      { key: 'myReceipts', label: 'My Receipts', icon: 'list' },
      { key: 'myMap', label: 'My Map', icon: 'map' },
    ],
  },
  {
    id: 'reports', title: 'Reports & Tasks', icon: 'list', roles: ['accounting', 'om', 'marketing', 'sales', 'dispatcher'],
    items: [
      { key: 'jobRecords', label: 'Job Records', icon: 'list' },
      { key: 'askBoard', label: 'Ask the Board', icon: 'chart' },
      { key: 'reports', label: 'Reports', icon: 'chart' },
      { key: 'tasks', label: 'Tasks', icon: 'check' },
      { key: 'dailyBrief', label: 'Daily Brief', icon: 'list' },
    ],
  },
  {
    id: 'setup', title: 'Setup', icon: 'sliders', roles: ['om'],
    items: [
      { key: 'teams', label: 'Team / Roles', icon: 'sliders' },
      { key: 'settings', label: 'Settings', icon: 'sliders' },
      { key: 'apiKeys', label: 'API Keys', icon: 'sliders' },
      { key: 'importExport', label: 'Import / Export', icon: 'list' },
      { key: 'helpDesk', label: 'Help Desk', icon: 'list' },
    ],
  },
];

const decorate = (it) => ({ ...it, href: hrefFor(it), status: statusFor(it) });

// Account is always available (everyone manages their own login).
const ACCOUNT = { key: 'account', label: 'Account', icon: 'lock', href: '/account', status: 'live' };

// Build the role's cockpit: { pinned, groups, account }.
export function navGroupsFor(role) {
  const pinned = PINNED.filter((p) => p.roles.includes('*') || roleOk(p.roles, role)).map(decorate);
  const groups = GROUPS
    .filter((g) => roleOk(g.roles, role))
    .map((g) => ({ id: g.id, title: g.title, icon: g.icon, items: g.items.map(decorate) }));
  return { pinned, groups, account: ACCOUNT };
}

// Route guard helper (used by lib/guard.requireHref). A route is allowed if it appears in the
// role's cockpit; routes the nav doesn't manage (e.g. /job/[id], /soon) are allowed by default.
const MANAGED = new Set(Object.values(LIVE));
export function canSee(href, role) {
  if (!MANAGED.has(href)) return true;
  const { pinned, groups, account } = navGroupsFor(role);
  const all = [account, ...pinned, ...groups.flatMap((g) => g.items)];
  return all.some((it) => it.href === href);
}

// A user's role id (fallback when no profile row yet) — kept for any remaining metadata callers.
export function roleOf(user) {
  return (user && user.user_metadata && user.user_metadata.role) || 'viewer';
}

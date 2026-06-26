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
  home: '/', board: '/board', myDay: '/my-day', qa: '/supervisor/jobs', pete: '/pete', hank: '/hank', meetings: '/meetings', onCall: '/on-call',
  customers: '/customers', projects: '/projects', pastDue: '/past-due', receivables: '/past-due', arBowl: '/past-due', invoices: '/invoices',
  photoReview: '/supervisor/jobs', openEstimates: '/open-estimates', priceBook: '/estimate', marketing: '/campaigns',
  shopCounter: '/shop', inventory: '/shop', shopDash: '/shop', fleet: '/my-truck', toolReg: '/tools', teams: '/team', account: '/account',
  // Field Ops + Reports screens (live with real data)
  staffScore: '/scorecard', techPerf: '/scorecard', crewRoles: '/crews', helperAssign: '/crews', crewTeams: '/team',
  callDesk: '/pete', collections: '/past-due', rolesAccess: '/team', corrections: '/corrections',
  jobRecords: '/job-records', booking: '/booking', paymentLedger: '/payments', cancelInsights: '/cancel-insights', creditCards: '/card-fees',
  topCustomers: '/top-customers', profitTruth: '/revenue', askBoard: '/ask', leakRadar: '/leak-radar', helperWaste: '/helper-waste', pickups: '/pickups',
  dailyBrief: '/daily-brief', tasks: '/tasks', webLeads: '/web-leads', receiptInbox: '/receipts',
  payrollRun: '/payroll', docFraud: '/doc-fraud', cashCustody: '/cash-custody', settings: '/settings', messages: '/messages',
  activePromises: '/promises', customerHeat: '/customer-heat', reminderQueue: '/reminders', savesToday: '/saves',
  memberships: '/memberships', bankPosition: '/bank-position', accounts: '/accounts', reviews: '/reviews',
  growth: '/growth', myPay: '/pay', awards: '/awards', payStructure: '/pay-structure', referrals: '/referrals', rankTracker: '/rank-tracker', leadFinder: '/leads', reviewIntel: '/competitors', territory: '/territory', contentEngine: '/content',
  // Shop module
  reorderList: '/shop', truckRestock: '/shop', toolCheckout: '/tool-checkout',
  purchaseOrders: '/purchase-orders', vendorList: '/vendors', vendorPrices: '/vendors', bulkBuy: '/bulk-buy',
  techSpend: '/tech-spend', partsRecon: '/parts-recon', slotting: '/slotting', stockMap: '/stock-map',
  fergusonCatalog: '/ferguson', barcode: '/barcode',
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
  { key: 'meetings', label: 'Meetings', icon: 'calendar', roles: ['*'] },
  { key: 'onCall', label: 'On-Call', icon: 'phone', roles: ['*'] },
];

// ── Groups (collapsible) ─────────────────────────────────────────────────────
const GROUPS = [
  {
    id: 'followup', title: 'Follow Up', icon: 'phone', roles: ['dispatcher', 'csr', 'om', 'accounting', 'marketing', 'sales'],
    items: [
      { key: 'webLeads', label: 'Web Leads', icon: 'phone' },
      { key: 'messages', label: 'Comms Desk', icon: 'phone' },
      { key: 'openEstimates', label: 'Open Estimates', icon: 'star' },
      { key: 'reminderQueue', label: 'Appt Reminders', icon: 'phone' },
      { key: 'activePromises', label: 'Active Promises', icon: 'phone' },
      { key: 'customerHeat', label: 'Customer Heat', icon: 'alert' },
      { key: 'cancelInsights', label: 'Cancel Insights', icon: 'alert' },
      { key: 'reviews', label: 'Reviews', icon: 'star' },
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
      { key: 'profitTruth', label: 'Revenue & AR', icon: 'star' },
      { key: 'leakRadar', label: 'Leak Radar', icon: 'alert' },
      { key: 'jobPL', label: 'Job P&L', icon: 'star' },
      { key: 'paymentLedger', label: 'Payment Ledger', icon: 'list' },
      { key: 'creditCards', label: 'Card Fees', icon: 'list' },
    ],
  },
  {
    id: 'fieldops', title: 'Field Ops', icon: 'truck', roles: ['om', 'fs', 'foreman', 'dispatcher'],
    items: [
      { key: 'techPerf', label: 'Tech Performance', icon: 'users' },
      { key: 'staffScore', label: 'Staff Scorecard', icon: 'users' },
      { key: 'crownAwards', label: 'Crown / Plunger', icon: 'star' },
      { key: 'helperAssign', label: 'Helpers', icon: 'users' },
      { key: 'helperWaste', label: 'Helper Waste', icon: 'alert' },
      { key: 'pickups', label: 'Tool Pickups', icon: 'truck' },
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
    id: 'shop', title: 'Shop', icon: 'list', roles: ['shop'],
    items: [
      { key: 'shopDash', label: 'Shop Dashboard', icon: 'chart' },
      { key: 'inventory', label: 'Shop Inventory', icon: 'list' },
      { key: 'partsRecon', label: 'Parts Reconciliation', icon: 'alert' },
      { key: 'reorderList', label: 'Reorder / Buy List', icon: 'list' },
      { key: 'truckRestock', label: 'Truck Restock', icon: 'truck' },
    ],
  },
  {
    id: 'invvendors', title: 'Inventory & Vendors', icon: 'list', roles: ['shop', 'om'],
    items: [
      { key: 'purchaseOrders', label: 'Purchase Orders', icon: 'list' },
      { key: 'vendorPrices', label: 'Vendor Prices', icon: 'star' },
      { key: 'vendorList', label: 'Vendor List', icon: 'list' },
      { key: 'stockMap', label: 'Stock Map', icon: 'map' },
      { key: 'techSpend', label: 'Tech Spend & Waste', icon: 'chart' },
      { key: 'bulkBuy', label: 'Bulk-Buy Finder', icon: 'star' },
      { key: 'slotting', label: 'Slotting & Putaway', icon: 'map' },
    ],
  },
  {
    id: 'shopcounter', title: 'Shop Counter', icon: 'list', roles: ['shop', 'om'],
    items: [
      { key: 'toolCheckout', label: 'Tool Check-Out', icon: 'check' },
      { key: 'shopCounter', label: 'Shop Counter', icon: 'list' },
      { key: 'fergusonCatalog', label: 'Ferguson Catalog', icon: 'list' },
      { key: 'barcode', label: 'Barcode / Labels', icon: 'list' },
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

// ── OFFICE shell nav (app./admin.sheetzz.com) — the 8 groups, exactly per the locked spec. ─────────────
// Money & AR / Sales & Mktg / Setup deliberately EXCLUDE fs (field supervisor sees no company financials/
// growth). owner/admin/gm are full-trust via ALL_ACCESS. Items with no LIVE-map key render /soon (to build).
const OFFICE_PINNED = [
  { key: 'hank', label: 'Hank', icon: 'sparkles', roles: ['dispatcher', 'csr', 'om', 'fs', 'foreman', 'accounting', 'marketing', 'sales'] },
  { key: 'meetings', label: 'Meetings', icon: 'calendar', roles: ['*'] },
  { key: 'onCall', label: 'On-Call', icon: 'phone', roles: ['*'] },
];
const OFFICE_GROUPS = [
  { id: 'commandCenter', title: 'Command Center', icon: 'truck', roles: ['dispatcher', 'csr', 'om', 'fs', 'foreman', 'sales', 'marketing'], items: [
    { key: 'home', label: 'Dashboard', icon: 'home' },
    { key: 'board', label: 'Dispatch Live', icon: 'truck' },
    { key: 'booking', label: 'Booking', icon: 'phone' },
    { key: 'callDesk', label: 'Call Desk', icon: 'phone' },
    { key: 'messages', label: 'Messages', icon: 'phone' },
    { key: 'webLeads', label: 'Web Leads', icon: 'phone' },
    { key: 'schedule', label: 'Schedule', icon: 'calendar' },
  ] },
  { id: 'customersGrp', title: 'Customers', icon: 'users', roles: ['dispatcher', 'csr', 'om', 'accounting', 'sales'], items: [
    { key: 'customers', label: 'Customers', icon: 'users' },
    { key: 'projects', label: 'Projects', icon: 'truck' },
    { key: 'accounts', label: 'Customer Accounts', icon: 'users' },
    { key: 'memberships', label: 'Memberships', icon: 'star' },
    { key: 'portalAccess', label: 'Portal Access', icon: 'lock' },
  ] },
  { id: 'money', title: 'Money & AR', icon: 'star', roles: ['accounting', 'om'], items: [
    { key: 'receivables', label: 'Who Owes Us', icon: 'star' },
    { key: 'pastDue', label: 'Past Due', icon: 'alert' },
    { key: 'invoices', label: 'Invoices', icon: 'list' },
    { key: 'paymentLinks', label: 'Payment Links', icon: 'list' },
    { key: 'collections', label: 'Collections', icon: 'alert' },
    { key: 'leakRadar', label: 'Leak Radar', icon: 'alert' },
    { key: 'deposits', label: 'Deposits', icon: 'star' },
  ] },
  { id: 'fieldOps', title: 'Field Ops', icon: 'truck', roles: ['om', 'fs', 'foreman', 'dispatcher'], items: [
    { key: 'techPerf', label: 'Tech Performance', icon: 'users' },
    { key: 'staffScore', label: 'Staff Scorecard', icon: 'users' },
    { key: 'photoReview', label: 'Photo Review / QA', icon: 'clipboardCheck' },
    { key: 'corrections', label: 'QA Holds', icon: 'alert' },
    { key: 'toolReg', label: 'Tools', icon: 'truck' },
    { key: 'crownAwards', label: 'Crown / Plunger Races', icon: 'star' },
    { key: 'helperAssign', label: 'Helpers', icon: 'users' },
    { key: 'crewRoles', label: 'Crew Roles', icon: 'users' },
    { key: 'crewTeams', label: 'Manage Teams', icon: 'users' },
    { key: 'techCapacity', label: 'Tech Capacity', icon: 'chart' },
    { key: 'permitRequests', label: 'Permit Requests', icon: 'list' },
    { key: 'jobRecords', label: 'Job Activity', icon: 'list' },
  ] },
  { id: 'shopInv', title: 'Shop / Inventory / Fleet', icon: 'list', roles: ['om', 'shop'], items: [
    { key: 'shopDash', label: 'Shop Dashboard', icon: 'chart' },
    { key: 'inventory', label: 'Shop Inventory', icon: 'list' },
    { key: 'toolCheckout', label: 'Tool Check-Out', icon: 'check' },
    { key: 'partsRecon', label: 'Parts Reconciliation', icon: 'alert' },
    { key: 'purchaseOrders', label: 'Purchase Orders', icon: 'list' },
    { key: 'vendorPrices', label: 'Vendor Prices', icon: 'star' },
    { key: 'vendorList', label: 'Vendor List', icon: 'list' },
    { key: 'stockMap', label: 'Stock Map', icon: 'map' },
    { key: 'fleet', label: 'Fleet', icon: 'truck' },
    { key: 'barcode', label: 'Barcode / Labels', icon: 'list' },
    { key: 'fergusonCatalog', label: 'Ferguson Catalog', icon: 'list' },
  ] },
  { id: 'salesGrp', title: 'Sales & Marketing', icon: 'flame', roles: ['sales', 'marketing', 'om'], items: [
    { key: 'marketing', label: 'Campaigns', icon: 'flame' },
    { key: 'rankTracker', label: 'Local Rank Tracker', icon: 'star' },
    { key: 'leadFinder', label: 'Lead Finder', icon: 'star' },
    { key: 'reviewIntel', label: 'Review Intel', icon: 'star' },
    { key: 'territory', label: 'Territory', icon: 'star' },
    { key: 'contentEngine', label: 'Content Engine', icon: 'flame' },
    { key: 'reviews', label: 'Reviews', icon: 'star' },
    { key: 'referrals', label: 'Referrals', icon: 'star' },
    { key: 'openEstimates', label: 'Open Estimates', icon: 'star' },
    { key: 'cancelInsights', label: 'Lost Jobs', icon: 'alert' },
    { key: 'callIntel', label: 'Call Intelligence', icon: 'chart' },
  ] },
  { id: 'reportsGrp', title: 'Reports & Tasks', icon: 'list', roles: ['accounting', 'om', 'marketing', 'sales', 'dispatcher'], items: [
    { key: 'dailyBrief', label: 'Daily Brief', icon: 'list' },
    { key: 'tasks', label: 'Tasks', icon: 'check' },
    { key: 'payrollRun', label: 'Payroll Queue', icon: 'star' },
    { key: 'recordDays', label: 'Record Days', icon: 'star' },
    { key: 'staffScore', label: 'Scorecards', icon: 'chart' },
  ] },
  { id: 'setupGrp', title: 'Setup', icon: 'sliders', roles: ['om'], items: [
    { key: 'settings', label: 'Settings', icon: 'sliders' },
    { key: 'awards', label: 'Awards & Bounties', icon: 'star' },
    { key: 'payStructure', label: 'Pay Structure', icon: 'sliders' },
    { key: 'rolesAccess', label: 'Roles & Access', icon: 'sliders' },
    { key: 'apiKeys', label: 'API Keys', icon: 'sliders' },
    { key: 'importExport', label: 'Import / Export', icon: 'list' },
  ] },
];

const decorate = (it) => ({ ...it, href: hrefFor(it), status: statusFor(it) });

// Account is always available (everyone manages their own login).
const ACCOUNT = { key: 'account', label: 'Account', icon: 'lock', href: '/account', status: 'live' };

// Which shell each pinned item (by key) + group (by id) belongs to. Anything unlisted defaults to office.
// This is PRESENTATION only — route access is still role-based (canSee/requireHref ignore the shell).
const SHELL_OF = {
  // pinned
  home: ['office', 'tech', 'shop'], board: ['office'], booking: ['office'], myDay: ['tech'], qa: ['office'],
  pete: ['office'], hank: ['office', 'tech'], meetings: ['office', 'tech', 'shop'], onCall: ['office', 'tech'],
  // groups
  followup: ['office'], customers: ['office'], accounting: ['office'], fieldops: ['office'],
  shop: ['shop'], invvendors: ['shop', 'office'], shopcounter: ['shop'], growth: ['office'],
  mywork: ['tech'], reports: ['office'], setup: ['office'],
};
const inShell = (key, shell) => !shell || (SHELL_OF[key] || ['office']).includes(shell);

// Build the role's cockpit for a shell: { pinned, groups, account }.
//   shell='office'|'admin' → the 8 OFFICE_GROUPS (office-only by construction).
//   shell='tech'|'shop'    → the legacy PINNED/GROUPS filtered by SHELL_OF.
// The shell is PRESENTATION only — route access (canSee) is role-based and shell-agnostic.
export function navGroupsFor(role, shell = null) {
  const office = shell === 'office' || shell === 'admin';
  const pinSrc = office ? OFFICE_PINNED : PINNED;
  const grpSrc = office ? OFFICE_GROUPS : GROUPS;
  const pinned = pinSrc.filter((p) => (p.roles.includes('*') || roleOk(p.roles, role)) && (office || inShell(p.key, shell))).map(decorate);
  const groups = grpSrc
    .filter((g) => roleOk(g.roles, role) && (office || inShell(g.id, shell)))
    .map((g) => ({ id: g.id, title: g.title, icon: g.icon, items: g.items.map(decorate) }));
  return { pinned, groups, account: ACCOUNT };
}

// Every nav item a ROLE can reach across ALL shells (office + tech/shop) — for route security only,
// ignores the shell so a route allowed in any shell passes its guard.
function allItemsForRole(role) {
  const pins = [...PINNED, ...OFFICE_PINNED].filter((p) => p.roles.includes('*') || roleOk(p.roles, role));
  const items = [...GROUPS, ...OFFICE_GROUPS].filter((g) => roleOk(g.roles, role)).flatMap((g) => g.items);
  return [ACCOUNT, ...pins, ...items].map(decorate);
}

// Route guard helper (used by lib/guard.requireHref). A route is allowed if it appears in the role's nav
// in ANY shell; routes the nav doesn't manage (e.g. /job/[id], /soon) are allowed by default.
const MANAGED = new Set(Object.values(LIVE));
export function canSee(href, role) {
  if (!MANAGED.has(href)) return true;
  return allItemsForRole(role).some((it) => it.href === href);
}

// A user's role id (fallback when no profile row yet) — kept for any remaining metadata callers.
export function roleOf(user) {
  return (user && user.user_metadata && user.user_metadata.role) || 'viewer';
}

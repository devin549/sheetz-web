// Canonical CB role + permission model — ported verbatim from the live Dispatch board
// (Dispatch_Sheet/dispatchboard_roles.html). This is the SINGLE source of truth for who
// can see/do what. Keep these ids + perm keys identical to the board so the web app and the
// Apps Script board never drift on permissions.
//
// A user's role id lives in Supabase user_metadata.role (e.g. 'owner', 'dispatcher', 'shop').

export const ROLES = {
  admin: {
    id: 'admin', label: 'Owner / Admin', short: 'Full access', color: 'oklch(60% 0.18 295)',
    perms: {
      seeAllTechs: true, seeAllJobs: true, seeRevenue: true, seeQueue: true,
      assignJobs: true, reassignJobs: true, editSchedule: true,
      createJobs: true, deleteJobs: true, changeStatus: true, contactCustomer: true,
      seeReports: true, manageUsers: true, seeFinancials: true, collectPayment: true,
    },
  },
  dispatcher: {
    id: 'dispatcher', label: 'Dispatcher', short: 'Schedule & assign', color: 'oklch(62% 0.14 240)',
    perms: {
      seeAllTechs: true, seeAllJobs: true, seeRevenue: true, seeQueue: true,
      assignJobs: true, reassignJobs: true, editSchedule: true,
      createJobs: true, deleteJobs: false, changeStatus: true, contactCustomer: true,
      seeReports: true, manageUsers: false, seeFinancials: false, collectPayment: false,
    },
  },
  csr: {
    id: 'csr', label: 'Office / CSR', short: 'Books jobs', color: 'oklch(66% 0.13 165)',
    perms: {
      seeAllTechs: true, seeAllJobs: true, seeRevenue: false, seeQueue: true,
      assignJobs: false, reassignJobs: false, editSchedule: false,
      createJobs: true, deleteJobs: false, changeStatus: false, contactCustomer: true,
      seeReports: false, manageUsers: false, seeFinancials: false, collectPayment: false,
    },
  },
  foreman: {
    id: 'foreman', label: 'Lead Tech / Foreman', short: 'Crew lead', color: 'oklch(64% 0.13 50)',
    perms: {
      seeAllTechs: false, seeCrew: true, seeAllJobs: false, seeRevenue: false, seeQueue: false,
      assignJobs: true, reassignJobs: true, editSchedule: false,
      createJobs: false, deleteJobs: false, changeStatus: true, contactCustomer: true,
      seeReports: false, manageUsers: false, seeFinancials: false, collectPayment: true,
    },
  },
  tech: {
    id: 'tech', label: 'Field Technician', short: 'My day only', color: 'oklch(60% 0.10 200)',
    perms: {
      seeAllTechs: false, seeOwnOnly: true, seeAllJobs: false, seeRevenue: false, seeQueue: false,
      assignJobs: false, reassignJobs: false, editSchedule: false,
      createJobs: false, deleteJobs: false, changeStatus: true, contactCustomer: true,
      seeReports: false, manageUsers: false, seeFinancials: false, collectPayment: true,
    },
  },
  viewer: {
    id: 'viewer', label: 'Read-only Viewer', short: 'Look, don’t touch', color: 'oklch(70% 0.04 240)',
    perms: {
      seeAllTechs: true, seeAllJobs: true, seeRevenue: true, seeQueue: true,
      assignJobs: false, reassignJobs: false, editSchedule: false,
      createJobs: false, deleteJobs: false, changeStatus: false, contactCustomer: false,
      seeReports: true, manageUsers: false, seeFinancials: true, collectPayment: false,
    },
  },
  customer: {
    id: 'customer', label: 'Customer Portal', short: 'Their job only', color: 'oklch(70% 0.10 60)',
    perms: {
      seeOwnJobOnly: true, seeAllTechs: false, seeAllJobs: false, seeRevenue: false, seeQueue: false,
      assignJobs: false, reassignJobs: false, editSchedule: false,
      createJobs: false, deleteJobs: false, changeStatus: false, contactCustomer: false,
      seeReports: false, manageUsers: false, seeFinancials: false, collectPayment: false,
    },
  },
};

// CB-specific named seats — piggyback on a base role's perms, then override (matches the board).
ROLES.gm = {
  id: 'gm', label: 'General Manager', short: 'Ronnie', color: 'oklch(64% 0.14 240)',
  perms: { ...ROLES.dispatcher.perms, seeRevenue: true, seeFinancials: true, manageUsers: true, seeReports: true },
};
ROLES.om = {
  id: 'om', label: 'Office Manager', short: 'Tracey', color: 'oklch(66% 0.13 165)',
  perms: { ...ROLES.csr.perms, seeRevenue: true, seeReports: true, manageUsers: true, editSchedule: true },
};
ROLES.accounting = {
  id: 'accounting', label: 'Accounting', short: 'Ashley', color: 'oklch(60% 0.10 295)',
  perms: { ...ROLES.viewer.perms, seeFinancials: true, seeReports: true, collectPayment: true },
};
ROLES.fs = {
  id: 'fs', label: 'Field Supervisor', short: 'Crew + quality', color: 'oklch(64% 0.13 50)',
  perms: { ...ROLES.dispatcher.perms, seeRevenue: false, seeFinancials: false, seeReports: true, manageUsers: false },
};
ROLES.sales = {
  id: 'sales', label: 'Sales', short: 'Estimates + pipeline', color: 'oklch(64% 0.16 145)',
  perms: { ...ROLES.csr.perms, seeRevenue: true, seeReports: true, createJobs: true },
};
ROLES.marketing = {
  id: 'marketing', label: 'Marketing', short: 'Campaigns + leads', color: 'oklch(66% 0.16 330)',
  perms: { ...ROLES.viewer.perms, seeRevenue: false, seeFinancials: false, seeReports: true, createJobs: true, contactCustomer: true },
};
ROLES.shop = {
  id: 'shop', label: 'Shop', short: 'Parts + inventory', color: 'oklch(62% 0.10 90)',
  perms: { ...ROLES.viewer.perms, seeRevenue: false, seeFinancials: false, seeReports: false, manageInventory: true },
};
ROLES.owner = ROLES.admin; // canonical CB id 'owner' === admin perms

// can(roleId, 'permKey') -> boolean. Unknown role / perm = false (deny by default).
export function can(roleId, perm) {
  const r = ROLES[String(roleId || '').toLowerCase()];
  return Boolean(r && r.perms[perm]);
}

// canAny(role, ['a','b']) -> true if the role has ANY of the listed perms.
export function canAny(roleId, perms) {
  return (perms || []).some((p) => can(roleId, p));
}

// Display metadata for a role chip (label, short blurb, color). Falls back to viewer.
export function roleMeta(roleId) {
  return ROLES[String(roleId || '').toLowerCase()] || ROLES.viewer;
}

// All assignable role ids (for an admin user-management picker later).
export const ROLE_IDS = Object.keys(ROLES).filter((id) => id !== 'admin'); // 'owner' is the canonical alias

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { roleOf, canSee } from '@/lib/nav';
import { canAny } from '@/lib/roles';

// Resolve the signed-in user (or bounce to /login).
async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { user, role: roleOf(user) };
}

// Page guard by explicit role id list — use for field screens with no clean perm key
// (e.g. My Truck, Shop). Canonical ids from lib/roles.js: owner, dispatcher, csr, foreman,
// tech, viewer, customer, gm, om, accounting, fs, sales, marketing, shop.
export async function requireRole(allowed) {
  const { user, role } = await requireUser();
  if (allowed && allowed.length && !allowed.includes(role)) redirect('/');
  return { user, role };
}

// Page guard by PERMISSION — passes if the role has ANY of the listed perms.
// Defense-in-depth on top of middleware + nav (a tech can't just type /past-due).
export async function requirePerm(...perms) {
  const flat = perms.flat();
  const { user, role } = await requireUser();
  if (flat.length && !canAny(role, flat)) redirect('/');
  return { user, role };
}

// Page guard that reuses the EXACT nav visibility rule for a route — so a page and its
// sidebar link can never disagree about who's allowed. Preferred for screens that map to a
// nav item. (For an AND-style rule like Customers, the nav rule already encodes it.)
export async function requireHref(href) {
  const { user, role } = await requireUser();
  if (!canSee(href, role)) redirect('/');
  return { user, role };
}

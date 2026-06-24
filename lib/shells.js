// Shell architecture — one codebase, multiple UIs picked by HOSTNAME (with a cookie override for testing
// before DNS is live). Permissions ALWAYS come from the user's role; the shell only changes which nav renders.
//   app./admin.sheetzz.com  -> office
//   tech.sheetzz.com         -> tech
//   shop.sheetzz.com         -> shop
// On the current vercel.app domain (no subdomains yet), shell = cookie override → else the role's default.

export const SHELLS = ['office', 'tech', 'shop'];
export const SHELL_META = {
  office: { label: 'Office', host: 'app.sheetzz.com' },
  tech: { label: 'Field / iPad', host: 'tech.sheetzz.com' },
  shop: { label: 'Shop', host: 'shop.sheetzz.com' },
};

export function shellFromHost(host) {
  const h = String(host || '').toLowerCase();
  if (h.startsWith('tech.') || h.startsWith('techsheetzz')) return 'tech';
  if (h.startsWith('shop.') || h.startsWith('shopsheetzz')) return 'shop';
  if (h.startsWith('app.') || h.startsWith('admin.') || h.startsWith('appsheetzz') || h.startsWith('adminsheetzz')) return 'office';
  return null; // current vercel.app domain → fall through to override/default
}

// A role's default shell when nothing else decides (techs/helpers live in the field shell; shop in shop).
export function defaultShellForRole(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'tech' || r === 'helper') return 'tech';
  if (r === 'shop') return 'shop';
  return 'office';
}

// Final shell resolution. host wins (real subdomain). Else honor the cookie override ONLY if the user is
// allowed into that shell. Else the role default.
export function resolveShell({ host, cookieShell, role, fieldMode, shopMode }) {
  const byHost = shellFromHost(host);
  if (byHost) return byHost;
  const canTech = fieldMode || ['owner', 'admin', 'gm', 'tech', 'helper', 'fs', 'foreman'].includes(String(role || '').toLowerCase());
  const canShop = shopMode || ['owner', 'admin', 'gm', 'om', 'shop'].includes(String(role || '').toLowerCase());
  if (cookieShell === 'tech' && canTech) return 'tech';
  if (cookieShell === 'shop' && canShop) return 'shop';
  if (cookieShell === 'office') return 'office';
  return defaultShellForRole(role);
}

// Which alternate shells this user is allowed to switch into (for the shell switcher).
export function switchableShells({ role, fieldMode, shopMode }) {
  const r = String(role || '').toLowerCase();
  const out = ['office'];
  if (fieldMode || ['owner', 'admin', 'gm', 'fs', 'foreman'].includes(r)) out.push('tech');
  if (shopMode || ['owner', 'admin', 'gm', 'om'].includes(r)) out.push('shop');
  // a pure tech/helper can stay in tech; a pure shop in shop — office isn't theirs
  if (r === 'tech' || r === 'helper') return ['tech'];
  if (r === 'shop') return ['shop'];
  return [...new Set(out)];
}

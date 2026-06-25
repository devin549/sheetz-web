// One login across the shells: scope the auth cookie to the parent domain when we're on sheetzz.com
// (so app./tech./shop.sheetzz.com share the session). On *.vercel.app / localhost we return undefined
// → the cookie stays host-only (Vercel preview domains can't set a shared parent cookie anyway).
const ROOT = 'sheetzz.com';
export function cookieDomainForHost(host) {
  const h = String(host || '').split(':')[0].toLowerCase();
  return h === ROOT || h.endsWith('.' + ROOT) ? '.' + ROOT : undefined;
}

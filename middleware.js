import { NextResponse } from 'next/server';

// Staff gate (interim, until per-user Supabase Auth + 2FA). Every page except the login screen
// requires a valid gate cookie — which is only set after entering the staff password. This keeps
// customer data off a wide-open public URL. Edge-safe: just a string compare, no crypto.
export function middleware(req) {
  const { pathname } = req.nextUrl;

  // Always allow the login page itself + Next internals.
  if (pathname.startsWith('/login')) return NextResponse.next();

  const token = req.cookies.get('cb_gate')?.value;
  const expected = process.env.COOKIE_TOKEN;

  if (expected && token && token === expected) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  if (pathname && pathname !== '/') url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

// Run on everything except static assets.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};

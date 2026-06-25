import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { cookieDomainForHost } from '@/lib/supabase/cookieDomain';

export async function POST(request) {
  const supabase = createClient();
  try { await supabase.auth.signOut(); } catch (_) {}

  const res = NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  // Belt-and-suspenders: hard-expire every Supabase auth cookie on BOTH host-only and the parent domain,
  // so sessions created before the .sheetzz.com cookie-domain change also clear (otherwise "can't log out").
  const domain = cookieDomainForHost(request.headers.get('host') || '');
  for (const c of cookies().getAll()) {
    if (/^sb-|supabase/i.test(c.name)) {
      res.cookies.set(c.name, '', { path: '/', maxAge: 0 });
      if (domain) res.cookies.set(c.name, '', { path: '/', maxAge: 0, domain });
    }
  }
  return res;
}

// Allow GET too, so a plain link can sign out (some clients block POST navigation).
export async function GET(request) {
  return POST(request);
}

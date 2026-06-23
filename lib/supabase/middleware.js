import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Refreshes the auth session on every request AND gates: not-signed-in → /login.
export async function updateSession(request) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    }
  );

  // IMPORTANT: do not run code between createServerClient and getUser() — keep them adjacent.
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isLogin = path.startsWith('/login');
  // Public API routes (webhooks: Vapi, Stripe, lead intake) authenticate themselves via a secret —
  // they carry no user cookie, so never bounce them to /login.
  const isPublicApi = path.startsWith('/api/');

  if (!user && !isLogin && !isPublicApi) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    if (path && path !== '/') url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

import { updateSession } from '@/lib/supabase/middleware';

// Per-user auth gate (Supabase). Every route except /login requires a signed-in user.
export async function middleware(request) {
  return await updateSession(request);
}

export const config = {
  // run on everything except static assets, auth callback, and API routes.
  // API routes perform their own auth/secret checks (Stripe/Vapi/AI agents/etc.).
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|auth/).*)'],
};

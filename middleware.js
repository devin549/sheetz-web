import { updateSession } from '@/lib/supabase/middleware';

// Per-user auth gate (Supabase). Every route except /login requires a signed-in user.
export async function middleware(request) {
  return await updateSession(request);
}

export const config = {
  // run on everything except static assets + auth callback
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|auth/).*)'],
};

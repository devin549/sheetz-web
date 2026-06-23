import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Per-request server client tied to the user's session cookies (RLS-gated as that user).
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component — safe to ignore (middleware refreshes the session)
          }
        },
      },
    }
  );
}

import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { cookieDomainForHost } from './cookieDomain';

// Per-request server client tied to the user's session cookies (RLS-gated as that user).
export function createClient() {
  const cookieStore = cookies();
  let domain;
  try { domain = cookieDomainForHost(headers().get('host')); } catch (_) { domain = undefined; }
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
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, domain ? { ...options, domain } : options));
          } catch {
            // called from a Server Component — safe to ignore (middleware refreshes the session)
          }
        },
      },
    }
  );
}

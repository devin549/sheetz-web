import { createBrowserClient } from '@supabase/ssr';

// Browser client — used by the login form (signInWithPassword) and any client component.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

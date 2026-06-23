import { createClient } from '@supabase/supabase-js';

// The public Supabase config. Safe in the browser — the anon key is gated by Row-Level Security.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// True once both env vars are set (so pages can show a friendly "connect Supabase" card instead of
// crashing before you've wired it up).
export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Returns a Supabase client, or null if the project isn't configured yet. Created per-call so it's
 * safe in both server components and the browser. Swap for the @supabase/ssr helpers when we add auth.
 */
export function getSupabase() {
  if (!isSupabaseConfigured) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

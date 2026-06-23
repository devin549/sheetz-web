import { createClient } from '@supabase/supabase-js';

// ⚠️ SERVER-ONLY. Uses the service_role key, which BYPASSES Row-Level Security.
// Never import this into a client component — it must only run on the server (Server Components,
// route handlers, server actions). The key comes from a NON-public env var so Next never ships it
// to the browser. This is the stopgap for reading protected data (customers) until staff auth lands;
// once Supabase Auth is in, protected reads move to a per-user client gated by RLS instead.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const isAdminConfigured = !!(url && serviceKey);

export function getSupabaseAdmin() {
  if (!isAdminConfigured) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

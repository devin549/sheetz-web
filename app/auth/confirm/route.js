import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Email-link confirm handler (Supabase SSR pattern). The reset email points here with a `token_hash` +
// `type`; we verify it server-side with verifyOtp — which is flow-agnostic, so it sidesteps the PKCE vs
// implicit mismatch that makes the default reset link throw `otp_expired`. On success the recovery session
// cookie is set and we forward to `next` (the set-new-password page). On failure → /login with a flag.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const nextParam = searchParams.get('next') || '/auth/reset';
  const next = nextParam.startsWith('/') ? nextParam : '/auth/reset';

  if (token_hash && type) {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL('/login?error=reset_link_invalid', origin));
}

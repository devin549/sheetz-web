// Global rate limiter (audit gap: no per-caller throttle anywhere). Durable + atomic via the Postgres rl_hit
// bucket function (mig 164) — works across serverless instances. FAIL-OPEN by design: any error (function
// missing because the migration hasn't run, DB hiccup) returns allowed, so a limiter problem can NEVER take
// down a real endpoint. Use on unauthenticated / paid-side-effect routes.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// Best-effort client IP from the proxy headers Vercel sets.
export function clientIp(request) {
  try {
    const h = request.headers;
    const fwd = (h.get('x-forwarded-for') || '').split(',')[0].trim();
    return fwd || h.get('x-real-ip') || h.get('cf-connecting-ip') || 'unknown';
  } catch (_) { return 'unknown'; }
}

// Returns { ok: true } (allowed) or { ok: false, retryAfter }. Never throws.
export async function rateLimit(key, { limit = 10, windowSec = 60 } = {}) {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return { ok: true };
    const { data, error } = await sb.rpc('rl_hit', { p_key: String(key).slice(0, 200), p_window_sec: windowSec, p_max: limit });
    if (error) return { ok: true };            // e.g. mig 164 not run yet → don't block
    return { ok: data !== false, retryAfter: windowSec };
  } catch (_) { return { ok: true }; }
}

// Convenience for API routes: returns a 429 Response if over the limit, else null (proceed).
export async function limitOr429(request, name, opts) {
  const r = await rateLimit(`${name}:${clientIp(request)}`, opts);
  if (r.ok) return null;
  return Response.json({ ok: false, error: 'Too many requests — please slow down and try again in a minute.' },
    { status: 429, headers: { 'Retry-After': String(r.retryAfter || 60) } });
}

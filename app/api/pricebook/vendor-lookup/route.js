import { NextResponse } from 'next/server';
import { canSeeCost } from '@/lib/pricebookEngine';
import { apiUser } from '@/lib/apiAuth';
import { vendorPrices, serpVendorConfigured } from '@/lib/serpVendor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 🔎 GET /api/pricebook/vendor-lookup?part=wax+ring — live vendor prices (Home Depot / Lowe's / Google
// Shopping) via SerpAPI, so a part's real cost is known WITHOUT a ServiceTitan part number. Cost-roles only.
export async function GET(request) {
  const me = await apiUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  if (!canSeeCost(me.role)) return NextResponse.json({ ok: false, error: 'Not allowed.' }, { status: 403 });
  if (!serpVendorConfigured()) return NextResponse.json({ ok: false, error: 'SERPAPI_KEY not set in Vercel.' }, { status: 503 });
  const part = new URL(request.url).searchParams.get('part') || '';
  if (!part.trim()) return NextResponse.json({ ok: false, error: 'Pass ?part=.' }, { status: 400 });
  const r = await vendorPrices(part, { limit: 10 });
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}

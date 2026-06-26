import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { canSeeCost } from '@/lib/pricebookEngine';
import { apiUser } from '@/lib/apiAuth';
import { searchItems } from '@/lib/pricebookQuery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 🔎 GET /api/pricebook/search?q=kitchen+drain&limit=25 — tech iPad search. Returns recommended
// services (name/photo/price + cost/margin if the role may see it). Matches name/sku/tags/aliases.
export async function GET(request) {
  const me = await apiUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  if (!isAdminConfigured) return NextResponse.json({ ok: false, error: 'Pricebook not configured.' }, { status: 503 });
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 25));
  if (!q.trim()) return NextResponse.json({ ok: true, items: [] });
  try {
    const items = await searchItems(getSupabaseAdmin(), q, { showCost: canSeeCost(me.role), limit });
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 160) }, { status: 500 });
  }
}

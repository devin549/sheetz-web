import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { canSeeCost } from '@/lib/pricebookEngine';
import { apiUser } from '@/lib/apiAuth';
import { itemDetail } from '@/lib/pricebookQuery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 📦 GET /api/pricebook/items?id=<uuid> — full item detail (photos, PDFs, manufacturer links, aliases,
// and cost/vendor data when the role allows). Or ?ids=a,b,c for a batch (e.g. rebuilding a cart).
export async function GET(request) {
  const me = await apiUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  if (!isAdminConfigured) return NextResponse.json({ ok: false, error: 'Pricebook not configured.' }, { status: 503 });
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const ids = (url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
  const showCost = canSeeCost(me.role);
  const sb = getSupabaseAdmin();
  try {
    if (id) {
      const item = await itemDetail(sb, id, { showCost });
      if (!item) return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 });
      return NextResponse.json({ ok: true, item });
    }
    if (ids.length) {
      const items = (await Promise.all(ids.map((x) => itemDetail(sb, x, { showCost })))).filter(Boolean);
      return NextResponse.json({ ok: true, items });
    }
    return NextResponse.json({ ok: false, error: 'Pass ?id= or ?ids=.' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 160) }, { status: 500 });
  }
}

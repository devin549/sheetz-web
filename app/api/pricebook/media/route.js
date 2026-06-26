import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { canSeeCost } from '@/lib/pricebookEngine';
import { apiUser } from '@/lib/apiAuth';
import { mediaFor } from '@/lib/pricebookQuery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 🖼 GET /api/pricebook/media?itemId=<uuid> — photos / install PDFs / manufacturer links for one item,
// so the tech can show the customer the spec sheet right on the iPad. Internal docs only show to cost roles.
export async function GET(request) {
  const me = await apiUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  if (!isAdminConfigured) return NextResponse.json({ ok: false, error: 'Pricebook not configured.' }, { status: 503 });
  const url = new URL(request.url);
  const itemId = url.searchParams.get('itemId') || url.searchParams.get('id');
  if (!itemId) return NextResponse.json({ ok: false, error: 'Pass ?itemId=.' }, { status: 400 });
  try {
    const media = await mediaFor(getSupabaseAdmin(), itemId, { showCost: canSeeCost(me.role) });
    return NextResponse.json({ ok: true, media });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 160) }, { status: 500 });
  }
}

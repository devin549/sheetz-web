import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { canSeeCost, marginHealth } from '@/lib/pricebookEngine';
import { canAny } from '@/lib/roles';
import { apiUser } from '@/lib/apiAuth';
import { runMarginWatch } from '@/app/(main)/pricebook-admin/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const canManage = (r) => canAny(r, ['manageInventory', 'manageUsers', 'seeReports', 'seeFinancials']);

// 📉 GET /api/pricebook/margin-watch — margin health summary + count of pending price-change requests.
//     Cost roles only. Never returns a price change as applied; just the watchlist.
export async function GET() {
  const me = await apiUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  if (!canSeeCost(me.role)) return NextResponse.json({ ok: false, error: 'Not allowed.' }, { status: 403 });
  if (!isAdminConfigured) return NextResponse.json({ ok: false, error: 'Pricebook not configured.' }, { status: 503 });
  const sb = getSupabaseAdmin();
  try {
    const { data: items } = await sb.from('pricebook_items').select('id, customer_name, name, retail_price, estimated_material_cost, target_margin_pct').eq('active', true).limit(2000);
    const tally = { healthy: 0, thin: 0, danger: 0, missing_price: 0 };
    const danger = [];
    (items || []).forEach((it) => {
      const h = marginHealth(it); tally[h] = (tally[h] || 0) + 1;
      if (h === 'danger' && Number(it.retail_price) > 0) danger.push({ id: it.id, name: it.customer_name || it.name, price: Number(it.retail_price) });
    });
    let pending = 0;
    try { const { count } = await sb.from('pricebook_price_update_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'); pending = count || 0; } catch (_) {}
    return NextResponse.json({ ok: true, summary: tally, pendingRequests: pending, danger: danger.slice(0, 25) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 160) }, { status: 500 });
  }
}

// 📉 POST /api/pricebook/margin-watch — owner/GM triggers the scan. Files PENDING price-change requests
//     for under-margin items. NEVER changes a price (approval happens in the Pricebook Editor).
export async function POST() {
  const me = await apiUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  if (!canManage(me.role)) return NextResponse.json({ ok: false, error: 'Owner / office only.' }, { status: 403 });
  const r = await runMarginWatch();
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

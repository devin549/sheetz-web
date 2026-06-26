import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { apiUser } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const num = (v) => (v == null || v === '' ? null : Math.max(0, Number(v) || 0));

// 🚩 POST /api/pricebook/price-change-request
//   body: { itemId, recommendedPrice?, newCost?, reason }
// A tech or GM flags that a price looks wrong (vendor cost jumped, etc.). Files a PENDING request — it
// does NOT change the price. Owner/GM approves or rejects in the Pricebook Editor. This is the human
// counterpart to AI margin-watch: same table, same approval gate, never auto-applied.
export async function POST(request) {
  const me = await apiUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  if (!isAdminConfigured) return NextResponse.json({ ok: false, error: 'Pricebook not configured.' }, { status: 503 });
  let body = {}; try { body = await request.json(); } catch {}
  const itemId = String(body.itemId || '').trim();
  const reason = String(body.reason || '').trim().slice(0, 600);
  if (!itemId) return NextResponse.json({ ok: false, error: 'itemId required.' }, { status: 400 });
  if (!reason) return NextResponse.json({ ok: false, error: 'Tell us why — a reason is required.' }, { status: 400 });
  const sb = getSupabaseAdmin();
  try {
    const { data: it } = await sb.from('pricebook_items').select('id, retail_price, estimated_material_cost').eq('id', itemId).maybeSingle();
    if (!it) return NextResponse.json({ ok: false, error: 'Item not found.' }, { status: 404 });
    const row = {
      item_id: itemId,
      old_price: Number(it.retail_price) || 0,
      recommended_price: num(body.recommendedPrice),
      old_cost: Number(it.estimated_material_cost) || 0,
      new_cost: num(body.newCost),
      reason,
      source: 'manual',
      status: 'pending',
      requested_by: me.user.id,
    };
    const { data, error } = await sb.from('pricebook_price_update_requests').insert(row).select('id').maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data?.id, message: 'Flagged for owner review — price unchanged.' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 160) }, { status: 500 });
  }
}

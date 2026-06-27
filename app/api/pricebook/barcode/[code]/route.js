import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { canSeeCost } from '@/lib/pricebookEngine';
import { apiUser } from '@/lib/apiAuth';
import { shapeItem } from '@/lib/pricebookQuery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 📷 GET /api/pricebook/barcode/<code> — a field scan resolves a barcode to its item, its price, and the
// SERVICES that use it (so the tech can add the right service to the estimate). Any signed-in tech; cost
// fields gated. Bumps times_scanned so we learn which codes get used.
export async function GET(request, { params }) {
  const me = await apiUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  if (!isAdminConfigured) return NextResponse.json({ ok: false, error: 'Pricebook not configured.' }, { status: 503 });
  const code = decodeURIComponent(params.code || '').trim();
  if (!code) return NextResponse.json({ ok: false, error: 'No barcode.' }, { status: 400 });
  const showCost = canSeeCost(me.role);
  const sb = getSupabaseAdmin();
  try {
    const { data: bc } = await sb.from('pricebook_barcodes').select('id, item_id, barcode, vendor_seller, unit_price, times_scanned').eq('barcode', code).maybeSingle();
    if (!bc) return NextResponse.json({ ok: true, found: false, barcode: code });
    try { await sb.from('pricebook_barcodes').update({ times_scanned: (Number(bc.times_scanned) || 0) + 1 }).eq('id', bc.id); } catch (_) {}

    const ITEM = 'id, sku, name, customer_name, customer_description, short_description, retail_price, minimum_price, estimated_material_cost, target_margin_pct, estimated_labor_hours, warranty_text, primary_photo_url, pdf_url, video_url, category_id, tags, customer_visible';
    const { data: it } = await sb.from('pricebook_items').select(ITEM).eq('id', bc.item_id).maybeSingle();
    const item = it ? shapeItem(it, showCost) : null;

    // Services that use this part (confirmed learned links) → tech adds the right one to the estimate.
    let services = [];
    try {
      const { data: links } = await sb.from('pricebook_learned_links').select('service_item_id').eq('part_item_id', bc.item_id).eq('status', 'confirmed').limit(20);
      const sids = [...new Set((links || []).map((l) => l.service_item_id))];
      if (sids.length) { const { data: svc } = await sb.from('pricebook_items').select(ITEM).in('id', sids).eq('active', true); services = (svc || []).filter((s) => showCost || s.customer_visible !== false).map((s) => shapeItem(s, showCost)); }
    } catch (_) {}

    return NextResponse.json({ ok: true, found: true, barcode: code, vendor: bc.vendor_seller || null, vendorPrice: showCost ? bc.unit_price : null, item, services });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 160) }, { status: 500 });
  }
}

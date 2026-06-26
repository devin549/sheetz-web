import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { canSeeCost } from '@/lib/pricebookEngine';
import { apiUser } from '@/lib/apiAuth';
import { buildEstimate, bundleForJobType, bundleBySlug } from '@/lib/pricebookQuery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 🧾 POST /api/pricebook/build-estimate
//   body: { picks:[{itemId, quantity}], jobType?, bundleSlug? }
// Rolls the selected items into an estimate (line totals + subtotal). For cost roles it also returns
// the blended margin and any line sold below its minimum (manager-approval flag). If jobType/bundleSlug
// is given it also returns the Good/Better/Best option set so the tech can present tiers.
export async function POST(request) {
  const me = await apiUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  if (!isAdminConfigured) return NextResponse.json({ ok: false, error: 'Pricebook not configured.' }, { status: 503 });
  let body = {}; try { body = await request.json(); } catch {}
  const picks = Array.isArray(body.picks) ? body.picks : [];
  const showCost = canSeeCost(me.role);
  const sb = getSupabaseAdmin();
  try {
    const estimate = await buildEstimate(sb, picks, { showCost });
    let bundle = null;
    if (body.bundleSlug) bundle = await bundleBySlug(sb, body.bundleSlug, { showCost });
    else if (body.jobType) bundle = await bundleForJobType(sb, body.jobType, { showCost });
    return NextResponse.json({ ok: true, estimate, bundle });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 160) }, { status: 500 });
  }
}

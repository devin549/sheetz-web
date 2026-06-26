import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { canSeeCost } from '@/lib/pricebookEngine';
import { apiUser } from '@/lib/apiAuth';
import { relatedItems, bundleForJobType } from '@/lib/pricebookQuery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 🧠 GET /api/pricebook/job-suggestions?items=a,b&jobType=drain — "techs who sold these also added…".
// Returns co-occurrence cross-sell items + the Good/Better/Best bundle for the job type, if one exists.
// AI SUGGESTS additions; it never adds to the estimate on its own — the tech taps to include.
export async function GET(request) {
  const me = await apiUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  if (!isAdminConfigured) return NextResponse.json({ ok: false, error: 'Pricebook not configured.' }, { status: 503 });
  const url = new URL(request.url);
  const items = (url.searchParams.get('items') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30);
  const jobType = url.searchParams.get('jobType') || '';
  const showCost = canSeeCost(me.role);
  const sb = getSupabaseAdmin();
  try {
    const [related, bundle] = await Promise.all([
      items.length ? relatedItems(sb, items, { showCost, limit: 6 }) : Promise.resolve([]),
      jobType ? bundleForJobType(sb, jobType, { showCost }) : Promise.resolve(null),
    ]);
    return NextResponse.json({ ok: true, related, bundle });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 160) }, { status: 500 });
  }
}

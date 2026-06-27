import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { learnFromJobs, repriceStaleParts, flagPartCostGaps } from '@/lib/pricebookLearn';
import { serpSearchesLeft } from '@/lib/serpVendor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Nightly self-driving pricebook. CRON_SECRET-gated. Learning is free (DB only); re-pricing is hard-capped
// (PRICEBOOK_CRON_BATCH parts/night, default 30 → ~60 SerpAPI calls) and rotates over the stalest parts so
// the SerpAPI budget can't blow. Rising parts cost files a PENDING price bump — the owner still approves.
function authed(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  const key = new URL(request.url).searchParams.get('key') || '';
  return auth === `Bearer ${secret}` || key === secret;
}

export async function GET(request) {
  if (!authed(request)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'No admin client' }, { status: 500 });

  const batch = Math.max(0, Math.min(100, Number(process.env.PRICEBOOK_CRON_BATCH) || 30));
  const floor = Math.max(0, Number(process.env.SERP_BUDGET_FLOOR) || 500); // keep this many searches in reserve

  // Phase 1 — free (DB only).
  const learned = await learnFromJobs(sb).catch(() => ({ added: 0, updated: 0 }));

  // Phase 2 — budget circuit-breaker: only spend SerpAPI if there's headroom above the reserve floor.
  let repriced;
  if (!process.env.SERPAPI_KEY || batch === 0) {
    repriced = { priced: 0, barcodes: 0, skipped: !process.env.SERPAPI_KEY ? 'no SERPAPI_KEY' : 'batch=0' };
  } else {
    const left = await serpSearchesLeft();
    if (left != null && left < floor + batch) {
      repriced = { priced: 0, barcodes: 0, skipped: `budget guard — ${left} searches left (reserve ${floor})`, searchesLeft: left };
    } else {
      repriced = await repriceStaleParts(sb, { limit: batch }).catch(() => ({ priced: 0, barcodes: 0 }));
      repriced.searchesLeft = left;
    }
  }

  // Phase 3 — free (DB only).
  const gaps = await flagPartCostGaps(sb).catch(() => ({ flagged: 0 }));

  return NextResponse.json({ ok: true, learned, repriced, gaps, at: new Date().toISOString() });
}

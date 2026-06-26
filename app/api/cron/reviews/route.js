import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchPlaceReviews, reviewsConfigured } from '@/lib/googleReviews';
import { matchReview, reviewExternalId } from '@/lib/reviewMatch';
import { createAlert } from '@/lib/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Watches the Google listing → inserts NEW reviews (deduped) → AUTO-MATCHES each to a tech and marks it.
// Unmatched ones land for the office to assign. Low ratings (<=3) raise a recovery alert. CRON_SECRET-gated.
function authed(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  const key = new URL(request.url).searchParams.get('key') || '';
  return auth === `Bearer ${secret}` || key === secret;
}

export async function GET(request) {
  if (!authed(request)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!reviewsConfigured()) return NextResponse.json({ ok: false, error: 'Set GOOGLE_PLACE_ID (+ GOOGLE_MAPS_KEY) to enable the watcher.' });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'No admin client' }, { status: 500 });

  const pull = await fetchPlaceReviews();
  if (!pull.ok) return NextResponse.json({ ok: false, error: pull.reason });

  // Context for matching: tech roster + last-30-day completed jobs.
  let techs = [], recentJobs = [];
  try { const { data } = await sb.from('techs').select('name'); techs = (data || []).filter((t) => t.name); } catch (_) {}
  try { const since = new Date(Date.now() - 30 * 864e5).toISOString(); const { data } = await sb.from('jobs').select('tech_name, customer_name, completed_at').gte('completed_at', since); recentJobs = data || []; } catch (_) {}

  let added = 0, matched = 0, skipped = 0;
  for (const rv of pull.reviews) {
    const external_id = reviewExternalId(rv.author, rv.time);
    // dedupe
    try { const { data: ex } = await sb.from('reviews').select('id').eq('external_id', external_id).maybeSingle(); if (ex) { skipped++; continue; } } catch (_) {}
    const m = matchReview({ text: rv.text, author: rv.author, techs, recentJobs });
    const row = {
      customer_name: rv.author || null, rating: rv.rating, text: rv.text || null, source: 'Google',
      tech_name: m.techName || null, external_id, matched: !!m.techName, match_method: m.method,
      created_at: rv.time ? new Date(rv.time * 1000).toISOString() : undefined,
    };
    let { error } = await sb.from('reviews').insert(row);
    if (error && /column|schema cache|does not exist/i.test(error.message || '')) {
      // pre-91 fallback: insert without the ingest columns (loses dedupe — but won't crash)
      ({ error } = await sb.from('reviews').insert({ customer_name: row.customer_name, rating: row.rating, text: row.text, source: 'Google', tech_name: row.tech_name }));
    }
    if (error) { skipped++; continue; }
    added++; if (m.techName) matched++;
    // Low rating → recovery alert (in-app first).
    if (rv.rating <= 3) {
      try { await createAlert(sb, { kind: 'missed_lead', entity: 'review', entityId: external_id, title: `New ${rv.rating}★ review${m.techName ? ` — ${m.techName}` : ''}`, body: `${rv.author || 'A customer'} left ${rv.rating}★: “${(rv.text || '').slice(0, 140)}”. Work Customer Recovery.`, severity: rv.rating <= 2 ? 'high' : 'med', dedupeKey: `review-low:${external_id}` }); } catch (_) {}
    }
  }
  return NextResponse.json({ ok: true, pulled: pull.reviews.length, added, matched, skipped, placeRating: pull.placeRating, total: pull.total });
}

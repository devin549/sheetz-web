import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { geocodeFull, mapsConfigured } from '@/lib/maps';
import { assessServiceArea, servedCitySet, MAX_MILES } from '@/lib/serviceArea';
import { COMPANY } from '@/lib/company';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUBLIC — the website's booking form calls this to verify a real, in-area service address before it
// lets someone lock a confirmed slot. Never blocks on its own (the office HOLD is the backstop); it
// returns a verdict the form acts on. Fail-soft if the Google key is absent.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const clean = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
export function OPTIONS() { return new NextResponse(null, { headers: CORS }); }

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400, headers: CORS }); }
  const q = [clean(body.address || body.street, 200), clean(body.city, 80), clean(body.state, 20), clean(body.zip, 12)].filter(Boolean).join(', ');
  if (q.replace(/[^a-z0-9]/gi, '').length < 4) return NextResponse.json({ ok: true, real: false, message: 'Enter your service address.' }, { headers: CORS });

  // No key → fail-soft: don't block bookings, let the office verify on the board.
  if (!mapsConfigured()) return NextResponse.json({ ok: true, configured: false, real: true, needsReview: false, message: '' }, { headers: CORS });

  const g = await geocodeFull(q);
  if (!g || typeof g.lat !== 'number') {
    return NextResponse.json({ ok: true, configured: true, real: false, message: "We couldn't find that address — please check the street, city, and ZIP." }, { headers: CORS });
  }

  const sb = getSupabaseAdmin();
  const servedSet = sb ? await servedCitySet(sb) : new Set();
  const a = assessServiceArea(g, servedSet);

  const message = !g.hasStreetNumber
    ? 'Add the house/street number so the crew can find you.'
    : a.needsReview
      ? `That's ${a.distanceMi != null ? `about ${a.distanceMi} mi out` : 'outside our usual area'} — we can't guarantee a time slot, but we'll review it and call you to confirm. Or call ${COMPANY.phone}.`
      : '';

  return NextResponse.json({
    ok: true, configured: true, real: true,
    verified: { formatted: g.formatted, street: g.street, city: g.city, state: g.state, zip: g.zip, lat: g.lat, lng: g.lng },
    hasStreetNumber: g.hasStreetNumber, inServedCity: a.inServedCity,
    distanceMi: a.distanceMi, maxMiles: MAX_MILES, needsReview: a.needsReview,
    message,
  }, { headers: CORS });
}

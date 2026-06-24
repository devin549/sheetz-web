import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ingest endpoint so the field app (Apps Script CB_Dispatch_TechLocation) can push live GPS into the web
// app. Secured by TECHLOC_SECRET (or CRON_SECRET). Body: { tech, lat, lng, accuracy?, source? }.
function authed(request) {
  const secret = process.env.TECHLOC_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  const key = new URL(request.url).searchParams.get('key') || '';
  return auth === `Bearer ${secret}` || key === secret;
}

export async function POST(request) {
  if (!authed(request)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const tech = String(body.tech || body.tech_name || '').trim();
  const lat = Number(body.lat), lng = Number(body.lng);
  if (!tech || Number.isNaN(lat) || Number.isNaN(lng)) return NextResponse.json({ ok: false, error: 'need tech, lat, lng' }, { status: 400 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'No admin client' }, { status: 500 });
  const row = { tech_name: tech, lat, lng, accuracy_m: Number(body.accuracy) || null, source: String(body.source || 'field-app').slice(0, 20), updated_at: new Date().toISOString() };
  const { error } = await sb.from('tech_locations').upsert(row, { onConflict: 'tech_name' });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { computeAvailability, CAPACITY } from '@/lib/availability';
import { COMPANY } from '@/lib/company';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUBLIC — the website's booking slot-picker reads this: next ~2 weeks of open arrival windows.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Cache-Control': 'public, max-age=60' };
export function OPTIONS() { return new NextResponse(null, { headers: CORS }); }

export async function GET(request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ days: [], phone: COMPANY.phone }, { headers: CORS });
  const n = Math.min(21, Math.max(3, Number(new URL(request.url).searchParams.get('days')) || 14));
  // Capacity = the techs we can field. Count active field roles.
  let techCount = 0;
  try { const { count } = await sb.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['tech', 'foreman', 'fs']); techCount = count || 0; } catch (_) {}
  const days = await computeAvailability(sb, n, techCount);
  const anyOpen = days.some((d) => d.windows.some((w) => w.open));
  return NextResponse.json({ days, anyOpen, capacity: CAPACITY, phone: COMPANY.phone }, { headers: CORS });
}

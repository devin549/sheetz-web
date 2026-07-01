import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { runHank } from '@/lib/hank';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Hank reads new #sheetz chatter on a schedule and chimes in where he can help.
// Secured by CRON_SECRET. Auto-posting to #sheetz is OPT-IN: set HANK_AUTOREPLY=on in Vercel.
// With it off, Hank still reads + marks messages seen (so you can watch behavior first) but stays quiet.
function authed(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`; // header-only (audit P2-13): ?key= leaked the CRON_SECRET into access logs
}

export async function GET(request) {
  if (!authed(request)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'No admin client' }, { status: 500 });
  const autoPost = String(process.env.HANK_AUTOREPLY || '').toLowerCase() === 'on';
  const r = await runHank(sb, { autoPost });
  return NextResponse.json({ ...r, autoPost }, { status: r.ok ? 200 : 500 });
}

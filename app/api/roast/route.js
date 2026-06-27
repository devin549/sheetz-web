import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { apiUser } from '@/lib/apiAuth';
import { generateAiRoast } from '@/lib/roastAI';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 🌽💩 GET /api/roast?race=revenue&rank=3&total=5&hhwp=0 — the tech's personal lane roast. Called ONLY
// when the Races screen actually mounts in their browser (not server-prerendered, not on a cron). Cached
// per (tech · day · race · rank · level) so re-opening the tab costs ZERO tokens. Returns text=null on a
// miss-with-no-AI so the client keeps the instant template.
const CB_TZ = 'America/New_York';
const dayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: CB_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export async function GET(request) {
  const me = await apiUser();
  if (!me) return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
  if (!isAdminConfigured) return NextResponse.json({ ok: true, text: null });
  const u = new URL(request.url);
  const race = ['revenue', 'review', 'hhwp'].includes(u.searchParams.get('race')) ? u.searchParams.get('race') : 'revenue';
  const rank = Math.max(0, Number(u.searchParams.get('rank')) || 0);
  const total = Math.max(1, Number(u.searchParams.get('total')) || 1);
  const hhwp = u.searchParams.get('hhwp') === '1' || race === 'hhwp';
  const level = ['PG', 'PG-13', 'R'].includes(me.profile.roastLevel) ? me.profile.roastLevel : 'PG';
  const day = dayKey();
  const sb = getSupabaseAdmin();

  // Cache hit → no tokens.
  try {
    const { data } = await sb.from('tech_roast_cache').select('text').eq('user_id', me.user.id).eq('day_key', day).eq('race', race).eq('rank', rank).eq('level', level).maybeSingle();
    if (data?.text) return NextResponse.json({ ok: true, text: data.text, cached: true });
  } catch (_) { /* table missing → just generate (fail-soft) */ }

  // Miss → generate ONE roast from the Anthropic files, cache it.
  const text = await generateAiRoast({ role: 'tech', name: me.profile.name, race, rank, total, level, hhwp });
  if (!text) return NextResponse.json({ ok: true, text: null }); // client keeps the template
  try { await sb.from('tech_roast_cache').insert({ user_id: me.user.id, day_key: day, race, rank, level, text }); } catch (_) {}
  return NextResponse.json({ ok: true, text });
}

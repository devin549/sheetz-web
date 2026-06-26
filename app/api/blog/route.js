import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUBLIC headless-blog feed — the CB website fetches this to render its blog. Only PUBLISHED posts, only
// customer-safe fields. No auth (the data is meant to be public). The Sheetz app is the CMS.
export const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Cache-Control': 'public, max-age=300' };

export function OPTIONS() { return new NextResponse(null, { headers: CORS }); }

export async function GET() {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ posts: [] }, { headers: CORS });
  let posts = [];
  try {
    const { data } = await sb.from('content_ideas').select('title, target_keyword, target_town, draft, published_url, created_at').eq('status', 'published').order('created_at', { ascending: false }).limit(200);
    posts = (data || []).map((p) => {
      const body = String(p.draft || '');
      const excerpt = body.replace(/[#>*_`-]/g, '').split('\n').map((l) => l.trim()).filter(Boolean).slice(1, 3).join(' ').slice(0, 180);
      return { slug: slugify(p.title), title: p.title, keyword: p.target_keyword || '', town: p.target_town || '', excerpt, date: p.created_at, externalUrl: p.published_url || null };
    });
  } catch (_) {}
  return NextResponse.json({ posts }, { headers: CORS });
}

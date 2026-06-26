import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { slugify } from '../route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Cache-Control': 'public, max-age=300' };
export function OPTIONS() { return new NextResponse(null, { headers: CORS }); }

// PUBLIC — one published post by slug (markdown body). The CB site renders it.
export async function GET(request, { params }) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: 'unavailable' }, { status: 404, headers: CORS });
  try {
    const { data } = await sb.from('content_ideas').select('title, target_keyword, target_town, draft, created_at').eq('status', 'published').limit(200);
    const post = (data || []).find((p) => slugify(p.title) === params.slug);
    if (!post) return NextResponse.json({ error: 'not found' }, { status: 404, headers: CORS });
    return NextResponse.json({ slug: params.slug, title: post.title, keyword: post.target_keyword || '', town: post.target_town || '', markdown: post.draft || '', date: post.created_at }, { headers: CORS });
  } catch (_) { return NextResponse.json({ error: 'error' }, { status: 500, headers: CORS }); }
}

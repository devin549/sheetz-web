import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// 1x1 transparent GIF.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const headers = { 'Content-Type': 'image/gif', 'Content-Length': String(PIXEL.length), 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', Pragma: 'no-cache', Expires: '0' };

// Email open beacon (like ServiceTitan / FieldEdge). The recipient's mail client loads this image
// → we stamp the email_sends row. Always returns the pixel, even on error (never break the email).
export async function GET(req) {
  const id = new URL(req.url).searchParams.get('s');
  if (id) {
    try {
      const sb = getSupabaseAdmin();
      if (sb) {
        const { data } = await sb.from('email_sends').select('opened_at, open_count').eq('id', id).maybeSingle();
        if (data) {
          const nowISO = new Date().toISOString();
          await sb.from('email_sends').update({
            opened_at: data.opened_at || nowISO, last_opened_at: nowISO, open_count: (data.open_count || 0) + 1,
          }).eq('id', id);
        }
      }
    } catch (_) { /* never break the pixel */ }
  }
  return new Response(PIXEL, { status: 200, headers });
}

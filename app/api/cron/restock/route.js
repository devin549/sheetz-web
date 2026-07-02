import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { postToDiscord } from '@/lib/discord';
import { etWeekday } from '@/lib/onCall';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 🏪 Reed's morning RESTOCK digest — 7:30am ET weekdays, before load-out. Low-stock is the SHOP's job,
// not dispatch's (Devin pulled the tile off Dispatch Live): every van part at/under its reorder point,
// grouped by van, with the deficit to bring it back to par. Quiet mornings post nothing.
// Secured by CRON_SECRET (header-only).
function authed(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get('authorization') || '') === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authed(request)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const wd = etWeekday();
  if (wd === 'Saturday' || wd === 'Sunday') return NextResponse.json({ ok: true, skipped: wd });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'No admin client' }, { status: 500 });

  let rows = [];
  try {
    const { data, error } = await sb.from('truck_inventory').select('tech_name, name, qty, reorder_point').limit(2000);
    if (error) throw error;
    rows = data || [];
  } catch (e) { return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 120) }, { status: 500 }); }

  const rp = (r) => (r.reorder_point != null ? Number(r.reorder_point) : 3);
  const low = rows.filter((r) => Number(r.qty || 0) <= rp(r));
  if (!low.length) return NextResponse.json({ ok: true, quiet: true, low: 0 });

  // Group by van, list each low part with its deficit-to-par. Cap lines so a rough week doesn't flood.
  const byVan = {};
  low.forEach((r) => { const v = r.tech_name || 'Unassigned'; (byVan[v] = byVan[v] || []).push(r); });
  const vans = Object.entries(byVan).sort((a, b) => b[1].length - a[1].length);
  const lines = vans.slice(0, 10).map(([van, items]) => {
    const parts = items.slice(0, 6).map((r) => `${r.name} (${Number(r.qty) || 0}/${rp(r)})`).join(', ');
    return `• **${van}** — ${parts}${items.length > 6 ? ` +${items.length - 6} more` : ''}`;
  });
  if (vans.length > 10) lines.push(`…and ${vans.length - 10} more vans`);

  const msg = `🏪 **Morning restock — ${low.length} low item${low.length === 1 ? '' : 's'}** (at/under reorder point):\n${lines.join('\n')}\n\nStock them at load-out → /shop has the full pick list.`;
  const r = await postToDiscord(msg, { to: 'office' });
  return NextResponse.json({ ok: !!r.ok, low: low.length, vans: vans.length, posted: r.ok, error: r.ok ? undefined : r.error });
}

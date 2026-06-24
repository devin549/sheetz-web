// Friday digest — compiles the week's rank moves, opportunities, and new competitor prices into a
// branded HTML email. Data-driven (no AI needed). Used by the cron + the "email me" button.
const money = (c) => '$' + Math.round((Number(c) || 0)).toLocaleString();
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shortLoc = (l) => String(l || '').replace(', United States', '').replace(', Kentucky', ', KY');

export async function buildDigest(sb) {
  // Rank moves: latest scan batch vs the previous batch.
  const rk = await sb.from('seo_rankings').select('keyword, location, cb_rank, scanned_at').order('scanned_at', { ascending: false }).limit(300);
  const rows = (rk.data || []);
  const times = [...new Set(rows.map((r) => r.scanned_at))];
  const latest = rows.filter((r) => r.scanned_at === times[0]);
  const prev = {}; rows.filter((r) => r.scanned_at === times[1]).forEach((r) => { prev[`${r.keyword}|${r.location}`] = r.cb_rank; });

  const wins = []; const slips = []; const opps = [];
  for (const r of latest) {
    const p = prev[`${r.keyword}|${r.location}`];
    const here = `${esc(r.keyword)} — ${esc(shortLoc(r.location))}`;
    if (p !== undefined && p != null && r.cb_rank != null && r.cb_rank < p) wins.push(`${here}: #${p} → <b>#${r.cb_rank}</b>`);
    else if (p !== undefined && p == null && r.cb_rank != null) wins.push(`${here}: <b>new at #${r.cb_rank}</b>`);
    else if (p !== undefined && p != null && (r.cb_rank == null || r.cb_rank > p)) slips.push(`${here}: #${p} → <b>${r.cb_rank == null ? 'not found' : '#' + r.cb_rank}</b>`);
    if (r.cb_rank == null || r.cb_rank > 10) opps.push(`${here}: <b>${r.cb_rank == null ? 'not found' : '#' + r.cb_rank}</b>`);
  }

  // New competitor prices logged in the last 7 days.
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const cp = await sb.from('competitor_pricing').select('competitor, service, price_cents, location, scanned_at').gte('scanned_at', since).order('price_cents', { ascending: false }).limit(40);
  const prices = (cp.error ? [] : (cp.data || []));

  const hasContent = wins.length || slips.length || opps.length || prices.length;
  const list = (arr, max = 12) => arr.slice(0, max).map((s) => `<li style="margin:3px 0">${s}</li>`).join('') || '<li style="color:#888">none</li>';
  const section = (title, color, inner) => `<div style="margin:16px 0 4px;font-weight:800;font-size:13px;color:${color};text-transform:uppercase;letter-spacing:.04em">${title}</div><ul style="margin:4px 0;padding-left:18px;font-size:14px">${inner}</ul>`;

  const priceRows = prices.length
    ? prices.map((p) => `<li style="margin:3px 0"><b>${money((p.price_cents || 0) / 100)}</b> — ${esc(p.competitor)} · ${esc(p.service || '')}${p.location ? ` · ${esc(shortLoc(p.location))}` : ''}</li>`).join('')
    : '<li style="color:#888">no new price mentions this week</li>';

  const html = `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
  <div style="max-width:600px;margin:0 auto;padding:24px">
    <div style="background:#fff;border:1px solid #e3e0d8;border-radius:10px;overflow:hidden">
      <div style="background:#FF6B00;color:#fff;padding:14px 20px;font-weight:800;font-size:16px">Clog Busterz — Friday Growth Report</div>
      <div style="padding:20px">
        <p style="margin:0 0 8px;font-size:13px;color:#555">Rank moves since the last scan, the keywords to chase, and competitor prices spotted this week.</p>
        ${section('✅ Wins', '#1a8a3a', list(wins))}
        ${section('⚠️ Watch (slipped)', '#b00', list(slips))}
        ${section('🎯 Opportunities (not on page one)', '#b86b00', list(opps))}
        ${section('💲 Competitor prices this week', '#1a1a1a', priceRows)}
      </div>
      <div style="padding:12px 20px;border-top:1px solid #eee;font-size:11px;color:#888">Open the board → Growth & Intel for the full picture + AI competitive read.</div>
    </div>
  </div></body></html>`;

  return { subject: `Friday Growth Report — ${wins.length} wins, ${opps.length} opportunities`, html, hasContent, stats: { wins: wins.length, slips: slips.length, opps: opps.length, prices: prices.length } };
}

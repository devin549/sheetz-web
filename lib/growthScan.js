// Growth scan cores — shared by the interactive /growth actions (auth-gated) AND the weekly cron
// (secret-gated). Each takes a Supabase admin client; no user session required.
import { getAnthropic, AI_MODEL } from '@/lib/anthropic';
import { cbAvgTickets } from '@/lib/cbStats';

export const CB_MATCH = 'clogbusterz';
export const KEYWORDS = ['drain cleaning', 'water heater repair', 'plumber near me', 'sewer line repair', 'emergency plumber', 'clogged drain'];
const FALLBACK_LOCATIONS = ['Richmond, Kentucky, United States', 'Lexington, Kentucky, United States'];

export const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

// Top markets from invoices (by volume); fall back to Richmond/Lexington.
export async function deriveMarkets(sb) {
  try {
    const counts = {};
    for (let from = 0; from < 8000; from += 1000) {
      const { data, error } = await sb.from('invoices').select('city').not('city', 'is', null).range(from, from + 999);
      if (error || !data || !data.length) break;
      for (const r of data) { const c = String(r.city || '').trim(); if (c) counts[c] = (counts[c] || 0) + 1; }
      if (data.length < 1000) break;
    }
    const cities = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
    if (!cities.length) return FALLBACK_LOCATIONS;
    return cities.map((c) => (/,/.test(c) ? `${c}, United States` : `${c}, Kentucky, United States`));
  } catch { return FALLBACK_LOCATIONS; }
}

// Rank scan: keyword × market → CB organic rank + local pack + competitors. Inserts seo_rankings rows.
export async function rankScanCore(sb, scannedBy) {
  const key = process.env.SERPAPI_KEY;
  if (!key) return { ok: false, msg: 'No SerpAPI key.' };
  const LOCATIONS = await deriveMarkets(sb);
  const rows = []; const errors = []; let credits = 0;
  for (const location of LOCATIONS) {
    for (const keyword of KEYWORDS) {
      try {
        const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&hl=en&gl=us&num=20&api_key=${key}`;
        const j = await (await fetch(url)).json(); credits++;
        if (j.error) { errors.push(`${keyword} @ ${location}: ${j.error}`); continue; }
        const organic = Array.isArray(j.organic_results) ? j.organic_results : [];
        let cb_rank = null; const top = [];
        for (const o of organic) {
          const d = domainOf(o.link);
          if (cb_rank === null && (d.includes(CB_MATCH) || String(o.title || '').toLowerCase().includes('clog buster'))) cb_rank = o.position || null;
          else if (top.length < 5 && d) top.push({ rank: o.position || null, title: (o.title || '').slice(0, 90), domain: d });
        }
        const localArr = (j.local_results && (j.local_results.places || j.local_results)) || [];
        const local = Array.isArray(localArr) ? localArr : [];
        const cb_in_local = local.some((p) => String(p.title || '').toLowerCase().includes('clog buster'));
        const local_results = local.slice(0, 6).map((p) => ({ name: p.title || '', rating: p.rating || null, reviews: p.reviews || p.user_ratings_total || null }));
        rows.push({ keyword, location, cb_rank, cb_in_local, top_results: top, local_results, scanned_by: scannedBy });
      } catch (e) { errors.push(`${keyword} @ ${location}: ${e && e.message ? e.message : String(e)}`); }
    }
  }
  if (rows.length) {
    const { error } = await sb.from('seo_rankings').insert(rows);
    if (error) return { ok: false, msg: /schema cache|does not exist|could not find/i.test(error.message || '') ? 'Run supabase/44_seo_rankings.sql first.' : error.message };
  }
  return { ok: true, count: rows.length, credits, errors };
}

// Pricing scan: paginate a competitor's Google reviews back ~monthsBack, Claude extracts price
// mentions + a market read vs CB avg tickets, dedup by quote, insert competitor_pricing rows.
export async function pricingScanCore(sb, { comp, loc, role, scannedBy, monthsBack = 4, maxPages = 6 }) {
  const key = process.env.SERPAPI_KEY;
  if (!key) return { ok: false, msg: 'No SerpAPI key.' };
  comp = String(comp || '').trim().slice(0, 120);
  if (!comp) return { ok: false, msg: 'No competitor.' };
  loc = String(loc || '').replace(', United States', '').replace(', Kentucky', ', KY').trim();
  const anthropic = getAnthropic(role);
  if (!anthropic) return { ok: false, msg: 'No Claude key.' };

  let dataId;
  try {
    const sj = await (await fetch(`https://serpapi.com/search.json?engine=google_maps&type=search&q=${encodeURIComponent(`${comp} ${loc}`)}&hl=en&api_key=${key}`)).json();
    dataId = (sj.place_results && sj.place_results.data_id) || (Array.isArray(sj.local_results) && sj.local_results[0] && sj.local_results[0].data_id) || null;
  } catch (e) { return { ok: false, msg: 'Maps lookup failed: ' + (e && e.message ? e.message : String(e)) }; }
  if (!dataId) return { ok: false, msg: `Couldn’t find "${comp}" on Google Maps.` };

  // paginate reviews back to the cutoff (or page cap)
  const cutoff = Date.now() - monthsBack * 30 * 86400000;
  const reviews = []; let token = null; let pages = 0;
  try {
    do {
      const url = `https://serpapi.com/search.json?engine=google_maps_reviews&data_id=${encodeURIComponent(dataId)}&sort_by=newest&hl=en${token ? `&next_page_token=${encodeURIComponent(token)}` : ''}&api_key=${key}`;
      const rj = await (await fetch(url)).json(); pages++;
      const batch = Array.isArray(rj.reviews) ? rj.reviews : [];
      let hitOld = false;
      for (const r of batch) {
        const iso = r.iso_date || null;
        if (iso && new Date(iso).getTime() < cutoff) { hitOld = true; continue; }
        if (r.snippet) reviews.push({ rating: r.rating || null, snippet: String(r.snippet).slice(0, 600) });
      }
      token = rj.serpapi_pagination && rj.serpapi_pagination.next_page_token;
      if (hitOld) break;
    } while (token && pages < maxPages);
  } catch (e) { return { ok: false, msg: 'Reviews fetch failed: ' + (e && e.message ? e.message : String(e)) }; }
  if (!reviews.length) return { ok: false, msg: `No readable reviews for "${comp}".` };

  const cbAvg = await cbAvgTickets(sb);
  let res;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL, max_tokens: 1400, output_config: { effort: 'low' },
      system: 'You mine plumbing-company Google reviews for PRICE intel. From the reviews, extract every concrete price a customer mentions paying (or was quoted). Return ONLY minified JSON: {price_points:[{service:string, price:number, rating:(number|null), quote:string}], market_read:string}. price is USD dollars (number, no $). service = short label (e.g. "water heater install"). quote = the short phrase containing the price. If NO prices are mentioned, price_points:[] and say so in market_read. Then market_read (1-2 sentences) comparing these to the provided Clog Busterz average tickets — is CB under/over market, and on what.',
      messages: [{ role: 'user', content: `Competitor: ${comp} (${loc})\nClog Busterz average tickets: ${JSON.stringify(cbAvg)}\n\nReviews:\n${reviews.map((r, i) => `${i + 1}. (${r.rating || '?'}★) ${r.snippet}`).join('\n')}` }],
    });
  } catch (e) { return { ok: false, msg: 'AI error: ' + (e && e.message ? e.message : String(e)) }; }

  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  let data;
  try { data = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim()); } catch { return { ok: false, msg: 'Couldn’t read the pricing analysis.' }; }
  const points = Array.isArray(data.price_points) ? data.price_points : [];

  // dedup by quote so weekly re-runs only add new prices
  let inserted = 0;
  if (points.length) {
    const { data: existing } = await sb.from('competitor_pricing').select('quote').eq('competitor', comp).limit(500);
    const seen = new Set((existing || []).map((e) => String(e.quote || '').trim().toLowerCase()));
    const rows = points.filter((p) => !seen.has(String(p.quote || '').trim().toLowerCase()))
      .map((p) => ({ competitor: comp, service: String(p.service || '').slice(0, 80), price_cents: Math.round((Number(p.price) || 0) * 100), rating: p.rating != null ? Number(p.rating) : null, quote: String(p.quote || '').slice(0, 400), location: loc, scanned_by: scannedBy }));
    if (rows.length) {
      const { error } = await sb.from('competitor_pricing').insert(rows);
      if (error && !/schema cache|does not exist|could not find/i.test(error.message || '')) return { ok: false, msg: error.message };
      if (error) return { ok: false, msg: 'Run supabase/45_competitor_pricing.sql first.' };
      inserted = rows.length;
    }
  }
  return { ok: true, points, inserted, market_read: data.market_read || '', reviewsScanned: reviews.length, cbAvg };
}

'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/anthropic';
import { cbAvgTickets } from '@/lib/cbStats';
import { revalidatePath } from 'next/cache';

// CB's site + the keywords we track. Edit here to tune the scan (each keyword×market = 1 SerpAPI credit).
const CB_MATCH = 'clogbusterz';
const KEYWORDS = ['drain cleaning', 'water heater repair', 'plumber near me', 'sewer line repair', 'emergency plumber', 'clogged drain'];
const FALLBACK_LOCATIONS = ['Richmond, Kentucky, United States', 'Lexington, Kentucky, United States'];
const MANAGE = ['owner', 'admin', 'gm', 'marketing', 'sales', 'om'];

const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

// Auto-derive the markets we actually work in from invoices (top cities by volume). Falls back to
// Richmond/Lexington if there's no city data. Returns SerpAPI location strings (top 5).
async function deriveMarkets(sb) {
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
    // SerpAPI wants a canonical location; CB's service area is central KY.
    return cities.map((c) => /,/.test(c) ? `${c}, United States` : `${c}, Kentucky, United States`);
  } catch { return FALLBACK_LOCATIONS; }
}

export async function runRankScan() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !MANAGE.includes(String(profile.role || '').toLowerCase())) return { ok: false, msg: 'Your role can’t run rank scans.' };
  const key = process.env.SERPAPI_KEY;
  if (!key) return { ok: false, msg: 'No SerpAPI key — add SERPAPI_KEY in Vercel.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const LOCATIONS = await deriveMarkets(sb);
  const rows = []; const errors = []; let credits = 0;
  for (const location of LOCATIONS) {
    for (const keyword of KEYWORDS) {
      try {
        const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&hl=en&gl=us&num=20&api_key=${key}`;
        const res = await fetch(url);
        const j = await res.json(); credits++;
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

        rows.push({ keyword, location, cb_rank, cb_in_local, top_results: top, local_results, scanned_by: profile.name || user.email });
      } catch (e) { errors.push(`${keyword} @ ${location}: ${e && e.message ? e.message : String(e)}`); }
    }
  }

  if (rows.length) {
    const { error } = await sb.from('seo_rankings').insert(rows);
    if (error) return { ok: false, msg: /schema cache|does not exist|could not find/i.test(error.message || '') ? 'Run supabase/44_seo_rankings.sql first.' : error.message };
  }
  revalidatePath('/growth');
  return { ok: true, msg: `Scanned ${rows.length} keyword/market pairs (${credits} SerpAPI credits used).${errors.length ? ` ${errors.length} failed.` : ''}`, errors: errors.slice(0, 8) };
}

// Pricing radar — pull a competitor's Google reviews (SerpAPI Maps) and have Claude extract any price
// mentions + read them against CB's average tickets. Human-initiated; ~2 SerpAPI credits per competitor.
export async function scanCompetitorPricing(name, location) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  const role = profile.role;
  if (!user || !MANAGE.includes(String(role || '').toLowerCase())) return { ok: false, msg: 'Your role can’t run this.' };
  const key = process.env.SERPAPI_KEY;
  if (!key) return { ok: false, msg: 'No SerpAPI key — add SERPAPI_KEY in Vercel.' };
  if (!isAiConfigured(role)) return { ok: false, msg: 'No Claude key for your role yet — add ANTHROPIC_KEY_* in Vercel.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };
  const comp = String(name || '').trim().slice(0, 120);
  if (!comp) return { ok: false, msg: 'Pick a competitor.' };
  const loc = String(location || '').replace(', United States', '').replace(', Kentucky', ', KY').trim();

  let dataId, reviews = [];
  try {
    const s = await fetch(`https://serpapi.com/search.json?engine=google_maps&type=search&q=${encodeURIComponent(`${comp} ${loc}`)}&hl=en&api_key=${key}`);
    const sj = await s.json();
    dataId = (sj.place_results && sj.place_results.data_id) || (Array.isArray(sj.local_results) && sj.local_results[0] && sj.local_results[0].data_id) || null;
    if (!dataId) return { ok: false, msg: `Couldn’t find "${comp}" on Google Maps — check the name.` };
    const rv = await fetch(`https://serpapi.com/search.json?engine=google_maps_reviews&data_id=${encodeURIComponent(dataId)}&sort_by=newest&hl=en&api_key=${key}`);
    const rj = await rv.json();
    reviews = (Array.isArray(rj.reviews) ? rj.reviews : []).map((r) => ({ rating: r.rating || null, snippet: (r.snippet || '').slice(0, 600) })).filter((r) => r.snippet);
  } catch (e) { return { ok: false, msg: 'Maps lookup failed: ' + (e && e.message ? e.message : String(e)) }; }
  if (!reviews.length) return { ok: false, msg: `No readable reviews found for "${comp}".` };

  const cbAvg = await cbAvgTickets(sb);
  const anthropic = getAnthropic(role);
  let res;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL, max_tokens: 1200, output_config: { effort: 'low' },
      system: 'You mine plumbing-company Google reviews for PRICE intel. From the reviews, extract every concrete price a customer mentions paying (or was quoted). Return ONLY minified JSON: {price_points:[{service:string, price:number, rating:(number|null), quote:string}], market_read:string}. price is USD dollars (number, no $). service = short label (e.g. "water heater install", "drain cleaning"). quote = the short phrase that contains the price. If NO prices are mentioned, return price_points:[] and say so in market_read. Then write market_read (1-2 sentences) comparing these to Clog Busterz average tickets (provided) — is CB priced under/over market, and on what.',
      messages: [{ role: 'user', content: `Competitor: ${comp} (${loc})\nClog Busterz average tickets: ${JSON.stringify(cbAvg)}\n\nReviews:\n${reviews.map((r, i) => `${i + 1}. (${r.rating || '?'}★) ${r.snippet}`).join('\n')}` }],
    });
  } catch (e) { return { ok: false, msg: 'AI error: ' + (e && e.message ? e.message : String(e)) }; }

  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  let data;
  try { data = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim()); } catch { return { ok: false, msg: 'Couldn’t read the pricing analysis — try again.' }; }
  const points = Array.isArray(data.price_points) ? data.price_points : [];
  if (points.length) {
    const rows = points.map((p) => ({ competitor: comp, service: String(p.service || '').slice(0, 80), price_cents: Math.round((Number(p.price) || 0) * 100), rating: p.rating != null ? Number(p.rating) : null, quote: String(p.quote || '').slice(0, 400), location: loc, scanned_by: profile.name || user.email }));
    const { error } = await sb.from('competitor_pricing').insert(rows);
    if (error && !/schema cache|does not exist|could not find/i.test(error.message || '')) return { ok: false, msg: error.message };
    if (error) return { ok: false, msg: 'Run supabase/45_competitor_pricing.sql first.' };
  }
  revalidatePath('/growth');
  return { ok: true, points, market_read: data.market_read || '', reviewsScanned: reviews.length, cbAvg };
}

// AI competitive analysis — reads the latest scan, aggregates the competitors that keep beating us,
// and asks Claude for each one's strengths/weaknesses + where CB should attack. Returns JSON.
export async function analyzeCompetition() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  const role = profile.role;
  if (!user || !MANAGE.includes(String(role || '').toLowerCase())) return { ok: false, msg: 'Your role can’t run this.' };
  if (!isAiConfigured(role)) return { ok: false, msg: 'No Claude key for your role yet — add ANTHROPIC_KEY_* in Vercel.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

  const { data: rows, error } = await sb.from('seo_rankings').select('keyword, location, cb_rank, top_results, local_results, scanned_at').order('scanned_at', { ascending: false }).limit(60);
  if (error || !rows || !rows.length) return { ok: false, msg: 'Run a rank scan first.' };
  const latestT = rows[0].scanned_at;
  const latest = rows.filter((r) => r.scanned_at === latestT);

  // aggregate organic competitors (by domain) + local competitors (by name w/ rating+reviews)
  const org = {}; const loc = {};
  for (const r of latest) {
    for (const t of (r.top_results || [])) { if (!t.domain || t.domain.includes(CB_MATCH)) continue; (org[t.domain] = org[t.domain] || { domain: t.domain, appearances: 0, bestRank: 99 }); org[t.domain].appearances++; if (t.rank && t.rank < org[t.domain].bestRank) org[t.domain].bestRank = t.rank; }
    for (const p of (r.local_results || [])) { const n = String(p.name || '').trim(); if (!n || n.toLowerCase().includes('clog buster')) continue; (loc[n] = loc[n] || { name: n, appearances: 0, rating: p.rating || null, reviews: p.reviews || null }); loc[n].appearances++; if (p.rating) loc[n].rating = p.rating; if (p.reviews) loc[n].reviews = p.reviews; }
  }
  const snapshot = {
    markets: [...new Set(latest.map((r) => r.location))],
    our_ranks: latest.map((r) => ({ keyword: r.keyword, location: r.location, cb_rank: r.cb_rank })),
    organic_competitors: Object.values(org).sort((a, b) => b.appearances - a.appearances).slice(0, 8),
    local_competitors: Object.values(loc).sort((a, b) => (b.reviews || 0) - (a.reviews || 0)).slice(0, 8),
  };

  const anthropic = getAnthropic(role);
  let res;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL, max_tokens: 1400, output_config: { effort: 'low' },
      system: 'You are a local-SEO + market strategist for Clog Busterz Plumbing (central Kentucky). From the JSON scan snapshot (our keyword ranks per market + the competitors beating us, with their local rating/review counts), produce a tight competitive read. Return ONLY minified JSON: {competitors:[{name, threat:("high"|"medium"|"low"), strengths:[string], weaknesses:[string]}], opportunities:[string], summary:string}. Be specific and practical — name the keyword/market gaps where Clog Busterz is weak (low rank or not found) and what to do. Use review counts/ratings as the strength signal. Max 6 competitors, max 6 opportunities. No prose outside the JSON.',
      messages: [{ role: 'user', content: `Scan snapshot:\n${JSON.stringify(snapshot)}` }],
    });
  } catch (e) { return { ok: false, msg: 'AI error: ' + (e && e.message ? e.message : String(e)) }; }

  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  let data;
  try { data = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim()); } catch { return { ok: false, msg: 'Couldn’t read the analysis — try again.' }; }
  return { ok: true, data };
}

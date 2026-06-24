'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/anthropic';
import { CB_MATCH, rankScanCore, pricingScanCore } from '@/lib/growthScan';
import { revalidatePath } from 'next/cache';

const MANAGE = ['owner', 'admin', 'gm', 'marketing', 'sales', 'om'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !MANAGE.includes(String(profile.role || '').toLowerCase())) return null;
  return { user, profile, sb: getSupabaseAdmin() };
}

// Rank scan (button). Markets auto-derive from invoices inside the core.
export async function runRankScan() {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Your role can’t run rank scans.' };
  if (!g.sb) return { ok: false, msg: 'Server not configured.' };
  if (!process.env.SERPAPI_KEY) return { ok: false, msg: 'No SerpAPI key — add SERPAPI_KEY in Vercel.' };
  const r = await rankScanCore(g.sb, g.profile.name || g.user.email);
  if (!r.ok) return r;
  revalidatePath('/growth');
  return { ok: true, msg: `Scanned ${r.count} keyword/market pairs (${r.credits} SerpAPI credits).${r.errors.length ? ` ${r.errors.length} failed.` : ''}`, errors: r.errors.slice(0, 8) };
}

// Pricing radar (button). First scan backfills ~monthsBack; dedup makes re-runs add only new prices.
export async function scanCompetitorPricing(name, location, monthsBack = 4) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Your role can’t run this.' };
  if (!g.sb) return { ok: false, msg: 'Server not configured.' };
  if (!process.env.SERPAPI_KEY) return { ok: false, msg: 'No SerpAPI key — add SERPAPI_KEY in Vercel.' };
  if (!isAiConfigured(g.profile.role)) return { ok: false, msg: 'No Claude key for your role yet — add ANTHROPIC_KEY_* in Vercel.' };
  const r = await pricingScanCore(g.sb, { comp: name, loc: location, role: g.profile.role, scannedBy: g.profile.name || g.user.email, monthsBack: Math.max(1, Math.min(12, Number(monthsBack) || 4)) });
  if (r.ok) revalidatePath('/growth');
  return r;
}

// AI competitive read — aggregates the latest scan's competitors → threat/strengths/weaknesses + attack plan.
export async function analyzeCompetition() {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Your role can’t run this.' };
  const role = g.profile.role;
  if (!isAiConfigured(role)) return { ok: false, msg: 'No Claude key for your role yet — add ANTHROPIC_KEY_* in Vercel.' };
  if (!g.sb) return { ok: false, msg: 'Server not configured.' };

  const { data: rows, error } = await g.sb.from('seo_rankings').select('keyword, location, cb_rank, top_results, local_results, scanned_at').order('scanned_at', { ascending: false }).limit(60);
  if (error || !rows || !rows.length) return { ok: false, msg: 'Run a rank scan first.' };
  const latestT = rows[0].scanned_at;
  const latest = rows.filter((r) => r.scanned_at === latestT);

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
      system: 'You are a local-SEO + market strategist for Clog Busterz Plumbing (central Kentucky). From the JSON scan snapshot (our keyword ranks per market + the competitors beating us, with their local rating/review counts), produce a tight competitive read. Return ONLY minified JSON: {competitors:[{name, threat:("high"|"medium"|"low"), strengths:[string], weaknesses:[string]}], opportunities:[string], summary:string}. Be specific — name the keyword/market gaps where Clog Busterz is weak (low rank or not found) and what to do. Use review counts/ratings as the strength signal. Max 6 competitors, max 6 opportunities. No prose outside the JSON.',
      messages: [{ role: 'user', content: `Scan snapshot:\n${JSON.stringify(snapshot)}` }],
    });
  } catch (e) { return { ok: false, msg: 'AI error: ' + (e && e.message ? e.message : String(e)) }; }

  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  let data;
  try { data = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim()); } catch { return { ok: false, msg: 'Couldn’t read the analysis — try again.' }; }
  return { ok: true, data };
}

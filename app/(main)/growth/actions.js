'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';

// CB's site + the markets/keywords we track. Edit here to tune the scan (each pair = 1 SerpAPI credit).
const CB_MATCH = 'clogbusterz';
const KEYWORDS = ['drain cleaning', 'water heater repair', 'plumber near me', 'sewer line repair', 'emergency plumber', 'clogged drain'];
const LOCATIONS = ['Richmond, Kentucky, United States', 'Lexington, Kentucky, United States'];
const MANAGE = ['owner', 'admin', 'gm', 'marketing', 'sales', 'om'];

const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

export async function runRankScan() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !MANAGE.includes(String(profile.role || '').toLowerCase())) return { ok: false, msg: 'Your role can’t run rank scans.' };
  const key = process.env.SERPAPI_KEY;
  if (!key) return { ok: false, msg: 'No SerpAPI key — add SERPAPI_KEY in Vercel.' };
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, msg: 'Server not configured.' };

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
        const local_results = local.slice(0, 5).map((p) => ({ name: p.title || '', rating: p.rating || null }));

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

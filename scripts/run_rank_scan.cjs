// Populate rank_checks: for each keyword × location, ask SerpAPI where Clog Busterz ranks in the local pack.
// Run manually to seed, or let the weekly cron do it. Needs SERPAPI_KEY + SUPABASE_* in .env.local.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.join(__dirname, '..');
const env = {};
for (const l of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim(); }
const SERP = env.SERPAPI_KEY;
if (!SERP) { console.error('Add SERPAPI_KEY to .env.local first.'); process.exit(1); }
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const KEYWORDS = ['plumber', 'emergency plumber', 'drain cleaning', 'clogged drain', 'water heater repair', 'water heater replacement', 'tankless water heater', 'sewer line repair', 'sump pump repair', 'toilet repair', 'leak detection', 'hydro jetting'];
const LOCATIONS = ['Richmond, Kentucky', 'Lexington, Kentucky', 'Berea, Kentucky', 'Nicholasville, Kentucky', 'Winchester, Kentucky', 'Mount Vernon, Kentucky'];
const BIZ = /clog\s*busterz/i;

async function localRank(keyword, location) {
  const url = `https://serpapi.com/search.json?engine=google_local&google_domain=google.com&hl=en&gl=us&q=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&api_key=${SERP}`;
  const r = await fetch(url, { cache: 'no-store' }); const j = await r.json();
  const results = j.local_results || [];
  let position = 0; const competitors = [];
  results.forEach((x, i) => { const pos = i + 1; if (BIZ.test(x.title || '')) position = pos; if (competitors.length < 5) competitors.push({ name: x.title, rating: x.rating || null, reviews: x.reviews || null, position: pos }); });
  return { found: position > 0, position: position || null, totalShown: results.length, competitors };
}

(async () => {
  const onlyLoc = process.argv.includes('--lex') ? ['Lexington, Kentucky'] : LOCATIONS;
  const total = KEYWORDS.length * onlyLoc.length;
  console.log(`Scanning ${total} keyword×town combos (SerpAPI searches = ${total})`);
  let done = 0, ranking = 0;
  for (const location of onlyLoc) {
    for (const keyword of KEYWORDS) {
      try {
        const r = await localRank(keyword, location);
        await sb.from('rank_checks').insert({ keyword, location, position: r.position, found: r.found, total_shown: r.totalShown, competitors: r.competitors });
        done++; if (r.found) ranking++;
        console.log(`  ${r.found ? '#' + r.position : '—'}  ${keyword}  ·  ${location.split(',')[0]}`);
      } catch (e) { console.log('  ✗', keyword, location, String(e.message || e)); }
    }
  }
  console.log(`Done. ${done} checks · ranking in ${ranking}/${done}.`);
})();

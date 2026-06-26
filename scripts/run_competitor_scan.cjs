// Snapshot the plumbers in the local pack (rating + reviews) per town → competitor_snapshots, so we can
// benchmark CB vs competitors over time. Needs SERPAPI_KEY + SUPABASE_* in .env.local.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.join(__dirname, '..');
const env = {};
for (const l of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim(); }
const SERP = env.SERPAPI_KEY;
if (!SERP) { console.error('Add SERPAPI_KEY to .env.local first.'); process.exit(1); }
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const LOCATIONS = ['Richmond, Kentucky', 'Lexington, Kentucky', 'Berea, Kentucky', 'Nicholasville, Kentucky', 'Winchester, Kentucky', 'Mount Vernon, Kentucky'];
const BIZ = /clog\s*busterz/i;

(async () => {
  let rows = [];
  for (const location of LOCATIONS) {
    try {
      const url = `https://serpapi.com/search.json?engine=google_local&google_domain=google.com&hl=en&gl=us&q=${encodeURIComponent('plumber')}&location=${encodeURIComponent(location)}&api_key=${SERP}`;
      const r = await fetch(url, { cache: 'no-store' }); const j = await r.json();
      const town = location.split(',')[0];
      (j.local_results || []).slice(0, 12).forEach((x) => { if (!x.title) return; rows.push({ business_name: x.title, town, rating: x.rating || null, reviews: x.reviews || null, is_us: BIZ.test(x.title) }); });
      console.log(`  ${town}: ${(j.local_results || []).length} listings`);
    } catch (e) { console.log('  ✗', location, String(e.message || e)); }
  }
  if (rows.length) { const { error } = await sb.from('competitor_snapshots').insert(rows); if (error) { console.error('insert FAIL', error.message); process.exit(1); } }
  console.log(`Done. ${rows.length} competitor snapshots across ${LOCATIONS.length} towns.`);
})();

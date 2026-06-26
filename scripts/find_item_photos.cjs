// Auto-find real product photos for pricebook items via SerpAPI (Google Shopping), re-host to Supabase, set
// primary_photo_url. Targets PRODUCT items (water heaters, faucets, etc.) without a photo. SerpAPI charges
// per search, so it's capped — run in batches. Needs SERPAPI_KEY + SUPABASE_* in .env.local.
// Usage:  node scripts/find_item_photos.cjs [--limit 25] [--all]   (--all = every item, not just products)
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

const ROOT = path.join(__dirname, '..');
const env = {};
for (const l of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim(); }
const SERP = env.SERPAPI_KEY;
if (!SERP) { console.error('Add SERPAPI_KEY to .env.local first.'); process.exit(1); }
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) || 25 : 25;
const all = args.includes('--all');
const BUCKET = 'pricebook-photos';
const PRODUCT = /heater|tankless|faucet|toilet|disposal|softener|sump|pump|valve|fixture|sink|vanity|bidet|filter|hydrant|hose bib|expansion tank|garbage/i;

async function serp(q) {
  try { const r = await fetch(`https://serpapi.com/search.json?engine=google_shopping&gl=us&hl=en&q=${encodeURIComponent(q)}&api_key=${SERP}`, { cache: 'no-store' }); const j = await r.json(); return ((j.shopping_results || [])[0] || {}).thumbnail || null; } catch { return null; }
}

(async () => {
  try { await sb.storage.createBucket(BUCKET, { public: true }); } catch (_) {}
  const { data: items } = await sb.from('pricebook_items').select('id, name, customer_name, sku, manufacturer, primary_photo_url').eq('active', true).limit(2000);
  const targets = (items || []).filter((it) => !it.primary_photo_url && (all || PRODUCT.test(`${it.name} ${it.customer_name || ''}`))).slice(0, limit);
  console.log(`${targets.length} items to photo this run (SerpAPI searches = ${targets.length})`);

  let done = 0;
  for (const it of targets) {
    const q = [it.manufacturer, it.customer_name || it.name, it.sku].filter(Boolean).join(' ');
    try {
      const url = await serp(q);
      if (!url) { console.log('  – no result:', it.name); continue; }
      const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) continue;
      const type = r.headers.get('content-type') || 'image/jpeg'; if (!/^image\//.test(type)) continue;
      const bytes = Buffer.from(await r.arrayBuffer());
      const ext = (type.split('/')[1] || 'jpg').split(';')[0].replace('jpeg', 'jpg');
      const key = `items/${it.id}/${randomUUID()}.${ext}`;
      const up = await sb.storage.from(BUCKET).upload(key, bytes, { contentType: type, upsert: true });
      if (up.error) { console.log('  ✗ upload', it.name, up.error.message); continue; }
      const pub = sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
      await sb.from('pricebook_items').update({ primary_photo_url: pub }).eq('id', it.id);
      done++; console.log(`  ✓ ${done}  ${it.name}`);
    } catch (e) { console.log('  ✗', it.name, String(e.message || e)); }
  }
  console.log(`Done. ${done} item photos set.`);
})();

// Generate branded Clog Busterz category-tile art with OpenAI gpt-image-1, upload to a public Supabase
// bucket, and write a manifest the catalog reads. Needs OPENAI_API_KEY in .env.local (Devin adds it).
// Usage:  node scripts/gen_category_art.cjs            (generates for categories missing art)
//         node scripts/gen_category_art.cjs --force    (regenerate all)
//         node scripts/gen_category_art.cjs --limit 20 (cap this run, to control cost)
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.join(__dirname, '..');
const env = {};
for (const l of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim(); }
const OPENAI = env.OPENAI_API_KEY;
if (!OPENAI) { console.error('Add OPENAI_API_KEY to .env.local first.'); process.exit(1); }
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const force = args.includes('--force');
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) || 9999 : 9999;
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const manifestPath = path.join(ROOT, 'public', 'catalog-art-manifest.json');

// A consistent brand prompt so every tile looks like one set.
const promptFor = (name) => `Professional flat vector illustration for a plumbing company price-book category tile: "${name}". ` +
  `Centered subject showing the relevant plumbing equipment or scene. Dark charcoal-navy background, warm amber and steel-blue accents, clean modern bold style, subtle depth, no text, no words, no letters, no logo. Square composition.`;

(async () => {
  // Ensure the public bucket exists.
  try { await sb.storage.createBucket('catalog-art', { public: true }); } catch (_) {}

  // Categories that render as tiles (have items in their subtree). Generate for those.
  const { data: cats } = await sb.from('pricebook_categories').select('id, name, parent_id');
  const { data: items } = await sb.from('pricebook_items').select('category_id').eq('active', true);
  const hasItems = new Set((items || []).map((i) => i.category_id));
  // subtree-has-items: a category or any descendant has items
  const kids = {}; cats.forEach((c) => { (kids[c.parent_id || 'root'] = kids[c.parent_id || 'root'] || []).push(c.id); });
  const memo = {};
  const subtree = (id) => { if (memo[id] != null) return memo[id]; let v = hasItems.has(id); for (const k of (kids[id] || [])) v = subtree(k) || v; return (memo[id] = v); };
  const targets = cats.filter((c) => subtree(c.id));

  let manifest = {}; try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (_) {}
  const todo = targets.filter((c) => force || !manifest[c.name]).slice(0, limit);
  console.log(`${targets.length} tile categories · ${todo.length} to generate this run (≈ $${(todo.length * 0.05).toFixed(2)})`);

  let done = 0;
  for (const c of todo) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-image-1', prompt: promptFor(c.name), size: '1024x1024', n: 1 }) });
      const j = await res.json();
      if (!res.ok || !j.data?.[0]?.b64_json) { console.error('  ✗', c.name, '-', (j.error?.message || res.status)); continue; }
      const bytes = Buffer.from(j.data[0].b64_json, 'base64');
      const key = slugify(c.name) + '.png';
      const up = await sb.storage.from('catalog-art').upload(key, bytes, { contentType: 'image/png', upsert: true });
      if (up.error) { console.error('  ✗ upload', c.name, up.error.message); continue; }
      manifest[c.name] = sb.storage.from('catalog-art').getPublicUrl(key).data.publicUrl;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      done++; console.log(`  ✓ ${done}/${todo.length}  ${c.name}`);
    } catch (e) { console.error('  ✗', c.name, String(e.message || e)); }
  }
  console.log(`Done. ${done} tiles generated. Manifest: public/catalog-art-manifest.json`);
})();

// Import a ServiceTitan pricebook export (.xlsx) → Sheetz pricebook_categories + pricebook_items.
// Usage:  npm install xlsx --no-save   then   node scripts/import_pricebook.cjs "C:\\path\\to\\Pricebook.xlsx"
// Idempotent (upserts on category slug + item sku). Photos/PDFs in ST are internal paths, so we DON'T import
// them as URLs (they'd break) — office adds customer-safe photos later. Costs are often blank in the export,
// so margin needs cost filled in the cockpit. Filters out ST placeholder/deactivated rows.
const fs = require('fs');
const path = require('path');
let XLSX; try { XLSX = require('xlsx'); } catch { console.error('Run: npm install xlsx --no-save'); process.exit(1); }

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error('Pass the .xlsx path as the first arg.'); process.exit(1); }

const { createClient } = require('@supabase/supabase-js');
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim(); }
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const num = (v) => Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')) || 0;
// ST descriptions are HTML — strip tags + decode the common entities so the customer sees clean text.
const stripHtml = (v) => String(v == null ? '' : v)
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<li>/gi, '• ')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
  .replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
const cleanCat = (v) => (String(v == null ? '' : v).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || 'Uncategorized').slice(0, 80);
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'cat';

// Light keyword tagger so job-smart suggestions light up immediately.
function jobTypesFor(text) {
  const t = text.toLowerCase(); const out = new Set();
  if (/drain|clog|cabling|sewer|jett|rooter|stoppage|backup/.test(t)) { out.add('drain unclog'); out.add('sewer backup'); }
  if (/water ?heater|tankless|heater/.test(t)) out.add('water heater install');
  if (/toilet|commode|flush/.test(t)) out.add('toilet repair');
  if (/faucet|fixture|sink|vanity/.test(t)) out.add('faucet');
  if (/camera|inspect|locat/.test(t)) out.add('camera inspection');
  if (/excavat|dig|main line|trench/.test(t)) out.add('excavation');
  return [...out];
}

(async () => {
  const wb = XLSX.readFile(file);
  const svc = XLSX.utils.sheet_to_json(wb.Sheets['Services'], { defval: '' });

  const isReal = (s) => {
    const code = String(s.Code || '').trim();
    const retail = num(s.UseStaticPrice ? s.StaticPrice : (s['DynamicPrice(ReadOnly)'] || s.StaticPrice));
    return s.Active == 1 && code && !/^service(deactivated)?$/i.test(code) && String(s.Name || '').toLowerCase() !== 'service' && retail > 0;
  };
  const real = svc.filter(isReal);

  // Build the FULL category tree from the Categories sheet (Category1..7 nesting → parent_id), keyed by the
  // ST category Id so items map exactly (leaf names collide; ids don't). Slug = name + '-' + stId (unique).
  const catSheet = XLSX.utils.sheet_to_json(wb.Sheets['Categories'], { defval: '' });
  const LEVELS = ['Category1', 'Category2', 'Category3', 'Category4', 'Category5', 'Category6', 'Category7'];
  const stack = {}; const catDefs = [];
  catSheet.forEach((row, i) => {
    let depth = -1, name = '';
    for (let d = 0; d < LEVELS.length; d++) { const v = cleanCat(row[LEVELS[d]]); if (v && v !== 'Uncategorized' && row[LEVELS[d]]) { depth = d; name = v; break; } }
    if (depth < 0) return;
    const stId = String(row.Id);
    stack[depth] = stId; for (let d = depth + 1; d < LEVELS.length; d++) delete stack[d];
    catDefs.push({ stId, name, parentStId: depth > 0 ? (stack[depth - 1] || null) : null, depth, sort: i * 10, active: row.Active == 1 });
  });
  const cats = catDefs.map((c) => ({ name: c.name, slug: (slugify(c.name).slice(0, 40) + '-' + c.stId).slice(0, 60), sort_order: c.sort, active: c.active }));
  let r = await sb.from('pricebook_categories').upsert(cats, { onConflict: 'slug' });
  if (r.error) { console.error('categories FAIL', r.error.message); process.exit(1); }
  const { data: catRows } = await sb.from('pricebook_categories').select('id, slug');
  const slugUuid = Object.fromEntries(catRows.map((c) => [c.slug, c.id]));
  const stUuid = {}; catDefs.forEach((c, i) => { stUuid[c.stId] = slugUuid[cats[i].slug]; });
  // 2nd pass: set parent_id from the tree.
  for (const c of catDefs) { if (c.parentStId && stUuid[c.parentStId] && stUuid[c.stId]) { try { await sb.from('pricebook_categories').update({ parent_id: stUuid[c.parentStId] }).eq('id', stUuid[c.stId]); } catch (_) {} } }

  // Items — dedupe sku (append Id on collision).
  const seen = new Set();
  const items = real.map((s) => {
    let sku = String(s.Code).trim().slice(0, 60);
    if (seen.has(sku)) sku = (sku + '-' + s.Id).slice(0, 60);
    seen.add(sku);
    const name = String(s.Name || sku).trim().slice(0, 200);
    const retail = num(s.UseStaticPrice ? s.StaticPrice : (s['DynamicPrice(ReadOnly)'] || s.StaticPrice));
    const catName = cleanCat(s['Category.Name']);
    return {
      category_id: stUuid[String(s['Category.Id'])] || null,
      sku, name, customer_name: name,
      short_description: stripHtml(s.Description).slice(0, 300) || null,
      customer_description: stripHtml(s.Description).slice(0, 1000) || null,
      retail_price: retail,
      minimum_price: null,
      estimated_material_cost: num(s.MaterialCost),
      estimated_labor_hours: num(s.Hours),
      target_margin_pct: 59,
      taxable: s.Taxable == 1,
      customer_visible: true,
      active: true,
      tags: [],
      job_types: jobTypesFor(name + ' ' + catName),
      warranty_text: String(s['Warranty Description'] || '').slice(0, 1000) || null,
    };
  });

  // Upsert in chunks of 200.
  let inserted = 0;
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200);
    r = await sb.from('pricebook_items').upsert(chunk, { onConflict: 'sku' });
    if (r.error) { console.error('items FAIL @' + i, r.error.message); process.exit(1); }
    inserted += chunk.length;
  }

  const { count } = await sb.from('pricebook_items').select('id', { count: 'exact', head: true });
  console.log(`IMPORTED ✓  categories=${cats.length}  services=${items.length}  (total items in book now: ${count})`);
})();

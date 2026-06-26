import { loadCockpit } from '../cockpit';
import JobHeader from '../JobHeader';
import { canSeeCost, buildTiers, shapeItem } from '@/lib/pricebookEngine';
import PricebookClient from './PricebookClient';

export const dynamic = 'force-dynamic';

// Rank items by how well they fit this job (job_type / tags overlap), so the tech doesn't hunt.
function scoreItem(item, jt) {
  const t = String(jt || '').toLowerCase();
  let s = 0;
  (item.job_types || []).forEach((j) => { if (t && (t.includes(String(j).toLowerCase()) || String(j).toLowerCase().includes(t))) s += 3; });
  (item.tags || []).forEach((g) => { if (t.includes(String(g).toLowerCase())) s += 1; });
  return s;
}

export default async function JobPricebook({ params }) {
  const c = await loadCockpit(params.id);
  if (!c.configured) return <div className="wrap"><div className="h1">📖 Pricebook</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const role = c.role;
  const jt = c.job.job_type || '';

  let needsMigration = false, items = [], categories = [], tiers = [], bundle = null;
  try {
    const ir = await c.sb.from('pricebook_items').select('*').eq('active', true).eq('customer_visible', true).limit(200);
    if (ir.error) { if (/relation|does not exist|schema cache/i.test(ir.error.message)) needsMigration = true; }
    else items = ir.data || [];
    if (!needsMigration) {
      const cr = await c.sb.from('pricebook_categories').select('id, name, slug, sort_order').eq('active', true).order('sort_order');
      categories = cr.data || [];
      // The Good/Better/Best bundle for this job type (first matching).
      const br = await c.sb.from('pricebook_bundles').select('*').eq('active', true);
      const bundles = br.data || [];
      bundle = bundles.find((b) => jt && String(b.job_type || '').toLowerCase() && (jt.toLowerCase().includes(String(b.job_type).toLowerCase()) || String(b.job_type).toLowerCase().includes(jt.toLowerCase()))) || bundles[0] || null;
      if (bundle) {
        const bir = await c.sb.from('pricebook_bundle_items').select('quantity, tiers, sort_order, item:pricebook_items(*)').eq('bundle_id', bundle.id).order('sort_order');
        tiers = buildTiers(bundle, bir.data || []);
      }
    }
  } catch (_) { needsMigration = true; }

  // Rank + shape items for this role (customer fields always; internal margin only if allowed).
  const ranked = items.map((i) => ({ raw: i, score: scoreItem(i, jt) })).sort((a, b) => b.score - a.score);
  const shaped = ranked.map(({ raw, score }) => ({ ...shapeItem(raw, role), categoryId: raw.category_id, suggested: score > 0, jobTypes: raw.job_types || [] }));

  const job = { id: c.job.id, number: c.job.job_number || '', type: jt, customerId: c.job.customer_id || null, techId: c.job.tech_id || null };

  return (
    <div className="wrap" style={{ maxWidth: 980 }}>
      <JobHeader job={c.job} customer={c.customer} tab="Pricebook" />
      {needsMigration ? (
        <div className="notice" style={{ marginTop: 10 }}>Run <code>supabase/104_pricebook.sql</code> + <code>105_pricebook_seed.sql</code> to load the Sheetz Pricebook.</div>
      ) : (
        <PricebookClient job={job} customer={{ name: c.customer?.name || 'Customer', address: c.customer?.address || '', phone: c.customer?.phone || '' }} items={shaped} categories={categories} tiers={tiers} bundle={bundle ? { slug: bundle.slug, name: bundle.name, customerDescription: bundle.customer_description, warranty: bundle.warranty_text, approveText: bundle.approval_button_text } : null} showMargin={canSeeCost(role)} />
      )}
    </div>
  );
}

'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';
import { revalidatePath } from 'next/cache';

const MANAGE = ['owner', 'admin', 'gm', 'om', 'shop', 'accounting'];

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await loadProfile(user);
  if (!user || !MANAGE.includes(String(profile.role || '').toLowerCase())) return null;
  return { user, profile, sb: getSupabaseAdmin() };
}
const clean = (v, n = 200) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

// Ferguson catalog search via SerpAPI (no Ferguson API): google_shopping filtered to Ferguson for
// priced items + a site:ferguson.com organic search for catalog product links.
export async function fergusonSearch(query) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Your role can’t use the catalog.' };
  const key = process.env.SERPAPI_KEY;
  if (!key) return { ok: false, msg: 'No SerpAPI key — add SERPAPI_KEY in Vercel.' };
  const q = clean(query, 120);
  if (q.length < 3) return { ok: false, msg: 'Type a part name or SKU.' };

  let priced = [], catalog = [];
  try {
    const [shopRes, orgRes] = await Promise.all([
      fetch(`https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(q)}&gl=us&hl=en&api_key=${key}`).then((r) => r.json()).catch(() => ({})),
      fetch(`https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q + ' site:ferguson.com')}&gl=us&hl=en&num=12&api_key=${key}`).then((r) => r.json()).catch(() => ({})),
    ]);
    priced = (Array.isArray(shopRes.shopping_results) ? shopRes.shopping_results : [])
      .filter((s) => /ferguson/i.test(String(s.source || s.store || '')) && s.extracted_price != null)
      .map((s) => ({ title: (s.title || '').slice(0, 120), price: Number(s.extracted_price), link: s.product_link || s.link || '' }))
      .slice(0, 10);
    catalog = (Array.isArray(orgRes.organic_results) ? orgRes.organic_results : [])
      .map((o) => ({ title: (o.title || '').slice(0, 120), link: o.link || '', snippet: (o.snippet || '').slice(0, 160) }))
      .filter((o) => o.link).slice(0, 12);
  } catch (e) { return { ok: false, msg: 'Search failed: ' + (e && e.message ? e.message : String(e)) }; }

  if (!priced.length && !catalog.length) return { ok: true, priced: [], catalog: [], msg: 'No Ferguson listings — try Bulk-Buy Finder for all vendors.' };
  return { ok: true, priced, catalog };
}

export async function saveFergusonPrice(formData) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Not allowed.' };
  const item = clean(formData.get('item'), 120);
  if (!item) return { ok: false, msg: 'No item.' };
  const { error } = await g.sb.from('vendor_prices').insert({
    vendor_id: null, vendor_name: 'Ferguson', item, sku: clean(formData.get('sku'), 60) || null,
    price_cents: Math.round((Number(formData.get('price')) || 0) * 100), unit: 'ea',
    updated_at: new Date().toISOString(), updated_by: g.profile.name || g.user.email,
  });
  if (error) return { ok: false, msg: /schema cache|does not exist|could not find/i.test(error.message || '') ? 'Run supabase/47_vendors_pos.sql first.' : error.message };
  revalidatePath('/vendors');
  return { ok: true, msg: `Saved ${item} → Ferguson price book.` };
}

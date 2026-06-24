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

// Price-shop a part across vendors via SerpAPI Google Shopping, and line it up against our price book.
export async function findPrices(query) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Your role can’t use the Bulk-Buy Finder.' };
  const key = process.env.SERPAPI_KEY;
  if (!key) return { ok: false, msg: 'No SerpAPI key — add SERPAPI_KEY in Vercel.' };
  const q = clean(query, 120);
  if (q.length < 3) return { ok: false, msg: 'Type a part name or SKU.' };

  let results = [];
  try {
    const r = await fetch(`https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(q)}&gl=us&hl=en&api_key=${key}`);
    const j = await r.json();
    if (j.error) return { ok: false, msg: j.error };
    results = (Array.isArray(j.shopping_results) ? j.shopping_results : [])
      .filter((s) => s.extracted_price != null)
      .map((s) => ({ title: (s.title || '').slice(0, 120), merchant: s.source || s.store || '—', price: Number(s.extracted_price), link: s.product_link || s.link || '', rating: s.rating || null }))
      .sort((a, b) => a.price - b.price)
      .slice(0, 16);
  } catch (e) { return { ok: false, msg: 'Search failed: ' + (e && e.message ? e.message : String(e)) }; }

  // our price book matches (what we already pay)
  let ourPrices = [];
  try {
    const { data } = await g.sb.from('vendor_prices').select('vendor_name, item, sku, price_cents, unit').ilike('item', `%${q}%`).order('price_cents').limit(8);
    ourPrices = data || [];
  } catch (_) { ourPrices = []; }

  return { ok: true, results, ourPrices };
}

// Save a found market price into the price book (builds the book from findings).
export async function saveMarketPrice(formData) {
  const g = await gate();
  if (!g) return { ok: false, msg: 'Not allowed.' };
  const item = clean(formData.get('item'), 120);
  const merchant = clean(formData.get('merchant'), 80);
  if (!item) return { ok: false, msg: 'No item.' };
  const { error } = await g.sb.from('vendor_prices').insert({
    vendor_id: null, vendor_name: merchant || 'Market', item, sku: clean(formData.get('sku'), 60) || null,
    price_cents: Math.round((Number(formData.get('price')) || 0) * 100), unit: 'ea',
    updated_at: new Date().toISOString(), updated_by: g.profile.name || g.user.email,
  });
  if (error) return { ok: false, msg: /schema cache|does not exist|could not find/i.test(error.message || '') ? 'Run supabase/47_vendors_pos.sql first.' : error.message };
  revalidatePath('/vendors');
  return { ok: true, msg: `Saved ${item} @ ${merchant} to the price book.` };
}

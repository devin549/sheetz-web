'use server';

// Phase 2b-i — Editor AI: Suggested Wording + Market Reference.
//
// Two server actions surfaced inside the item editor:
//   1. suggestCustomerCopy(itemId)  — Claude (owner key) drafts customer-benefit copy from the item's
//      INTERNAL text. Returns a SUGGESTION; the user applies/edits it. applyCustomerCopy() writes copy ONLY.
//   2. buildMarketReference(itemId)  — a SOURCED estimate (live material + BLS labor + AI national range)
//      shown BESIDE the owner's price. READ-ONLY decision support.
//
// HOUSE RULES (HARD):
//   • Owner is the ONLY price-mover. Market reference NEVER writes/auto-suggests a retail_price.
//     Suggested copy NEVER touches any price field.
//   • Honest: the AI range is labeled an estimate to verify; missing sources are omitted, never faked.
//   • Graceful degrade: no owner Anthropic key → a clear "Add ANTHROPIC_KEY_OWNER in Vercel" message
//     (mirrors askHank); no SerpAPI/BLS → that source is omitted with a note. Never crash.
//   • Gates: copy = canEditPricebookContent (owner/gm/om/marketing); reference = canEditPriceFields
//     (owner/gm/om — NOT marketing, it's pricing-adjacent).

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/anthropic';
import { canEditPricebookContent, canEditPriceFields } from '@/lib/pricebookEngine';
import { vendorPrices, serpVendorConfigured, serpSearchesLeft } from '@/lib/serpVendor';
import {
  blsSeriesId, resolveBlsArea, laborBenchmark, materialFromLearnedParts,
  formatReference, parseAiRange,
} from '@/lib/marketReference';

const clean = (v, n = 400) => String(v == null ? '' : v).trim().slice(0, n);
const missingCol = (msg) => /relation|column|schema cache|does not exist/i.test(msg || '');
const COPY_ROLE = 'owner'; // pricebook AI runs on the owner key (rolls usage up to Owner/GM), like Hank.

// Auth context. need = 'content' (copy) or 'price' (reference). Returns the same shape as editorActions.
async function ctx(need = 'content') {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  const role = profile.role;
  if (need === 'price' && !canEditPriceFields(role)) return { err: 'Pricing insight is owner / GM / OM only.' };
  if (need === 'content' && !canEditPricebookContent(role)) return { err: 'Not allowed.' };
  return { user, profile, role, sb: getSupabaseAdmin() };
}

async function logAiUsage(c, screen, res) {
  try {
    await c.sb.from('ai_usage').insert({
      role: c.role, screen, model: AI_MODEL,
      input_tokens: res?.usage?.input_tokens || 0, output_tokens: res?.usage?.output_tokens || 0,
      user_email: c.user.email || '',
    });
  } catch (_) {}
}

const aiText = (res) => (res?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
const stripFence = (t) => String(t || '').replace(/^```(json)?/i, '').replace(/```$/, '').trim();

// ── 1. Suggested customer copy ─────────────────────────────────────────────────────────────────────────
const COPY_SYSTEM = [
  "You write customer-facing copy for Clog Busterz, a plumbing company in Richmond + Lexington KY.",
  "You are given a service item's INTERNAL text (the tech/office-facing name + notes). Rewrite it as copy a",
  "homeowner reads on the estimate at their kitchen table. CB voice: plumber-plain, warm, OUTCOME-first —",
  "sell the RESULT and the protection (no more backups, no water damage, peace of mind), not the spec or jargon.",
  "HARD RULES:",
  "1. NEVER mention cost, margin, our material price, vendors, SKUs, internal part numbers, or office language.",
  "2. NO hype, NO fake urgency, NO invented warranties/guarantees — only outcomes that plainly follow from the work.",
  "3. customer_name: a short, clear, benefit-leaning name (≤ 60 chars). Title case, no SKU.",
  "4. customer_description: 1–3 short sentences, outcome-first, the protection it gives them. Plain English.",
  'Return ONLY valid JSON: {"customer_name":"…","customer_description":"…"}. No preamble.',
].join('\n');

export async function suggestCustomerCopy(itemId) {
  const c = await ctx('content'); if (c.err) return { ok: false, msg: c.err };
  const id = clean(itemId, 80); if (!id) return { ok: false, msg: 'No item.' };
  if (!isAiConfigured(COPY_ROLE)) return { ok: false, msg: 'Add ANTHROPIC_KEY_OWNER in Vercel to draft copy.' };

  let it = null;
  try {
    const { data, error } = await c.sb.from('pricebook_items')
      .select('id, name, customer_name, internal_name, internal_notes, short_description, customer_description, sku')
      .eq('id', id).maybeSingle();
    if (error) return { ok: false, msg: missingCol(error.message) ? 'Run supabase/104_pricebook.sql first.' : error.message };
    it = data;
  } catch (e) { return { ok: false, msg: String(e?.message || e) }; }
  if (!it) return { ok: false, msg: 'Item not found.' };

  const internal = {
    name: it.name || '', internal_name: it.internal_name || '', sku: it.sku || '',
    internal_notes: it.internal_notes || '', short_description: it.short_description || '',
    current_customer_name: it.customer_name || '', current_customer_description: it.customer_description || '',
  };

  const anthropic = getAnthropic(COPY_ROLE);
  let res;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL, max_tokens: 500, output_config: { effort: 'low' },
      system: COPY_SYSTEM,
      messages: [{ role: 'user', content: `Internal item data:\n${JSON.stringify(internal)}\n\nDraft the customer-facing name + description. JSON only.` }],
    });
  } catch (e) { return { ok: false, msg: 'AI error: ' + String((e && e.message) || e).slice(0, 140) }; }
  await logAiUsage(c, 'pricebook-suggest-copy', res);

  let parsed = {};
  try { parsed = JSON.parse(stripFence(aiText(res))) || {}; } catch (_) { parsed = {}; }
  const customerName = clean(parsed.customer_name, 60);
  const customerDescription = clean(parsed.customer_description, 600);
  if (!customerName && !customerDescription) return { ok: false, msg: 'AI returned nothing usable — try again.' };

  // SUGGESTION ONLY — never auto-written. The editor shows it for the user to apply/edit.
  return { ok: true, draft: true, suggestion: { customerName, customerDescription } };
}

// Apply an (optionally user-edited) copy suggestion. Writes customer_name / customer_description ONLY.
// NEVER touches a price field. Re-gated to canEditPricebookContent.
export async function applyCustomerCopy(itemId, suggestion) {
  const c = await ctx('content'); if (c.err) return { ok: false, msg: c.err };
  const id = clean(itemId, 80); if (!id) return { ok: false, msg: 'No item.' };
  const s = suggestion || {};
  const patch = {};
  const name = clean(s.customerName, 60);
  const desc = clean(s.customerDescription, 600);
  if (name) patch.customer_name = name;
  if (desc) patch.customer_description = desc;
  if (!Object.keys(patch).length) return { ok: false, msg: 'Nothing to apply.' };

  const { error } = await c.sb.from('pricebook_items').update(patch).eq('id', id);
  if (error) return { ok: false, msg: missingCol(error.message) ? 'Run supabase/104_pricebook.sql first.' : error.message };
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.role, action: 'pricebook.copy.apply_ai', entity: 'pricebook_item', entity_id: id, detail: { fields: Object.keys(patch) } }); } catch (_) {}
  revalidatePath('/pricebook-admin'); revalidatePath('/catalog');
  return { ok: true, msg: 'Customer copy applied.' };
}

// ── 2. Market reference (READ-ONLY decision support — NEVER writes/auto-suggests a price) ───────────────

// BLS public data API — one POST for the hourly-mean-wage series. Returns the wage number or null + a note.
async function blsHourlyWage(areaHint) {
  const key = process.env.BLS_API_KEY;
  if (!key) return { wage: null, note: 'add BLS_API_KEY for labor benchmarking', area: null };
  const area = resolveBlsArea(areaHint);
  const seriesId = blsSeriesId({ areaCode: area.code, areaType: area.type, datatype: '13' }); // 13 = hourly mean
  try {
    const r = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seriesid: [seriesId], registrationkey: key }), cache: 'no-store',
    });
    const j = await r.json();
    const series = j?.Results?.series?.[0];
    const latest = series?.data?.find((d) => d?.value != null);
    const wage = latest ? Number(String(latest.value).replace(/[^0-9.]/g, '')) : null;
    if (!(wage > 0)) return { wage: null, note: 'BLS returned no wage for this series', area: area.label };
    return { wage, note: null, area: area.label, period: latest.year || '' };
  } catch (e) { return { wage: null, note: 'BLS lookup failed: ' + String(e?.message || e).slice(0, 80), area: area.label }; }
}

// Claude national typical-range — CLEARLY an estimate to verify, never authoritative market data.
const RANGE_SYSTEM = [
  "You are a plumbing pricing analyst for Clog Busterz (Richmond + Lexington KY).",
  "Given a residential plumbing service, give a REASONED typical NATIONAL all-in price range a homeowner",
  "would pay (parts + labor + overhead), as a low and a high. This is a rough estimate from general knowledge,",
  "NOT live market data — the owner will verify it. Be honest and conservative; one plausible range, not extremes.",
  'Return ONLY valid JSON: {"low": <number>, "high": <number>}. Whole dollars. No text.',
].join('\n');

async function aiTypicalRange(c, item) {
  if (!isAiConfigured(COPY_ROLE)) return { range: null, note: 'Add ANTHROPIC_KEY_OWNER in Vercel for the AI range.' };
  const desc = {
    name: item.customer_name || item.name || '', short: item.short_description || '',
    customer: item.customer_description || '', labor_hours: item.estimated_labor_hours ?? null,
  };
  const anthropic = getAnthropic(COPY_ROLE);
  let res;
  try {
    res = await anthropic.messages.create({
      model: AI_MODEL, max_tokens: 120, output_config: { effort: 'low' },
      system: RANGE_SYSTEM,
      messages: [{ role: 'user', content: `Service:\n${JSON.stringify(desc)}\n\nTypical national price range? JSON only.` }],
    });
  } catch (e) { return { range: null, note: 'AI error: ' + String((e && e.message) || e).slice(0, 80) }; }
  await logAiUsage(c, 'pricebook-market-range', res);
  let parsed = null;
  try { parsed = JSON.parse(stripFence(aiText(res))); } catch (_) { parsed = aiText(res); }
  const range = parseAiRange(parsed);
  return { range, note: range ? null : 'AI did not return a usable range' };
}

// Build the sourced reference. Reads the item + its learned parts; sums learned parts that already carry a
// vendor_price, optionally runs ONE live SerpAPI lookup per still-unpriced part (capped) to fill the gap;
// fetches BLS labor if keyed; asks Claude for a national range. Returns structured sources + the one-line
// summary. WRITES NOTHING to pricebook_items. `runLiveMaterial` opt-in spends SerpAPI credits.
export async function buildMarketReference(itemId, { runLiveMaterial = true } = {}) {
  const c = await ctx('price'); if (c.err) return { ok: false, msg: c.err };
  const id = clean(itemId, 80); if (!id) return { ok: false, msg: 'No item.' };

  let item = null;
  try {
    const { data, error } = await c.sb.from('pricebook_items')
      .select('id, name, customer_name, short_description, customer_description, sku, retail_price, estimated_material_cost, estimated_labor_hours')
      .eq('id', id).maybeSingle();
    if (error) return { ok: false, msg: missingCol(error.message) ? 'Run supabase/104_pricebook.sql first.' : error.message };
    item = data;
  } catch (e) { return { ok: false, msg: String(e?.message || e) }; }
  if (!item) return { ok: false, msg: 'Item not found.' };

  // ── Material: learned parts first, then fill priced gaps via SerpAPI (opt-in, capped). ──
  let links = [];
  try { const { data } = await c.sb.from('pricebook_learned_links').select('part_name, quantity, status, vendor_price').eq('service_item_id', id).neq('status', 'rejected'); links = data || []; } catch (_) { links = []; }
  const rolled = materialFromLearnedParts(links);
  let material = rolled.total > 0 ? rolled.total : null;
  let materialSource = rolled.priced > 0 ? `live · ${rolled.priced} learned part${rolled.priced === 1 ? '' : 's'}` : 'live';
  let materialNote = null;

  const serpOn = serpVendorConfigured();
  // Circuit-breaker: don't fan out paid lookups if the SerpAPI daily budget is spent. null = unknown → proceed.
  const serpBudget = (serpOn && runLiveMaterial) ? await serpSearchesLeft() : null;
  const canSerp = serpOn && (serpBudget == null || serpBudget > 0);
  const serpCap = serpBudget == null ? 4 : Math.max(0, Math.min(4, serpBudget));
  if (runLiveMaterial && canSerp && rolled.unpriced.length) {
    // Fill missing prices with a live lookup — capped at 4 (and never beyond the remaining SerpAPI budget).
    let added = 0, filled = 0;
    for (const part of rolled.unpriced.slice(0, serpCap)) {
      const r = await vendorPrices(part.name);
      if (r.ok && (r.cheapest || r.sellers?.[0]?.price)) { added += (r.cheapest ?? r.sellers[0].price) * (part.qty || 1); filled += 1; }
    }
    if (filled) { material = Math.round(((material || 0) + added) * 100) / 100; materialSource = `live · ${rolled.priced + filled} part${rolled.priced + filled === 1 ? '' : 's'}`; }
  } else if (runLiveMaterial && canSerp && !links.length) {
    // No learned parts at all → a single lookup on the item/SKU as a rough material proxy.
    const r = await vendorPrices(item.name || item.customer_name || item.sku || '');
    if (r.ok && r.cheapest) { material = r.cheapest; materialSource = `live · ${r.sellers?.[0]?.seller || 'vendor'}`; materialNote = 'rough single-part proxy (no learned bill of materials yet)'; }
  }
  if (material == null && !serpOn) materialNote = 'add SERPAPI_KEY for live material pricing';
  else if (material == null && serpOn && serpBudget === 0) materialNote = 'SerpAPI search budget spent for today — try later';

  // ── Labor: BLS hourly wage × labor hours (omitted entirely if no BLS key). ──
  const laborHours = Number(item.estimated_labor_hours) || 0;
  // CB home metro is Lexington-Fayette (the OES area covering Richmond too). No per-user metro field today.
  const bls = await blsHourlyWage('lexington');
  const labor = laborBenchmark(bls.wage, laborHours);
  const laborSource = bls.area ? `BLS · ${bls.area}` : 'BLS';
  const laborNote = bls.note || (laborHours <= 0 ? 'set labor hours on this item for a labor benchmark' : null);

  // ── AI typical national range (honest estimate, clearly labeled). ──
  const { range, note: rangeNote } = await aiTypicalRange(c, item);

  const { line, parts } = formatReference({ material, materialSource, labor, laborSource, range });

  return {
    ok: true,
    readonly: true,
    ownerPrice: Number(item.retail_price) || 0,
    line,
    parts,
    sources: {
      material: { value: material, source: materialSource, note: materialNote },
      labor: { value: labor, hourlyWage: bls.wage, hours: laborHours, source: laborSource, note: laborNote, period: bls.period },
      range: range ? { low: range.low, high: range.high, source: 'AI estimate — verify, not authoritative', note: rangeNote } : { low: null, high: null, note: rangeNote },
    },
    disclaimer: 'Decision support only. CB never sets a price from this — the owner sets the price.',
  };
}

// Pricebook self-driving engine — the cron-callable core (no auth; takes an admin sb). Three phases:
//   1. learnFromJobs  — FREE (DB only): mine parts techs used × services sold → strengthen service↔part links.
//   2. repriceStaleParts — BUDGET-CAPPED: SerpAPI-price only the N stalest confirmed parts, rotating over days.
//   3. flagPartCostGaps — when a service's live parts cost outruns its baked cost, file a PENDING price bump
//      for the OWNER to approve (never auto-changes a price — the hard rule).
import { vendorPrices } from '@/lib/serpVendor';
import { priceForTargetMargin } from '@/lib/pricebookEngine';

const nowISO = () => new Date().toISOString();
const DEFAULT_TARGET = 59;

// ── Phase 1: learn (free) ──────────────────────────────────────────────────────────────────────
export async function learnFromJobs(sb, { cap = 600 } = {}) {
  let usage = [], issues = [];
  try { const { data } = await sb.from('job_pricebook_usage').select('job_id, item_id').limit(8000); usage = data || []; } catch (_) {}
  try { const { data } = await sb.from('shop_issues').select('job_id, item_name, kind').limit(8000); issues = data || []; } catch (_) {}
  if (!usage.length || !issues.length) return { added: 0, updated: 0 };
  const svcByJob = {}; usage.forEach((u) => { if (u.job_id && u.item_id) (svcByJob[u.job_id] = svcByJob[u.job_id] || new Set()).add(u.item_id); });
  const partsByJob = {}; issues.forEach((i) => { if (i.job_id && i.item_name && i.kind !== 'rental') (partsByJob[i.job_id] = partsByJob[i.job_id] || []).push(String(i.item_name).trim()); });
  const tally = {};
  for (const [jobId, svcs] of Object.entries(svcByJob)) {
    const parts = partsByJob[jobId]; if (!parts) continue;
    for (const sid of svcs) for (const pn of parts) { if (!pn) continue; const k = sid + '' + pn.toLowerCase(); (tally[k] = tally[k] || { sid, pn, n: 0 }).n++; }
  }
  let added = 0, updated = 0;
  for (const e of Object.values(tally).slice(0, cap)) {
    try {
      const { data: ex } = await sb.from('pricebook_learned_links').select('id').eq('service_item_id', e.sid).ilike('part_name', e.pn).maybeSingle();
      if (ex) { await sb.from('pricebook_learned_links').update({ times_seen: e.n, updated_at: nowISO() }).eq('id', ex.id); updated++; }
      else { const { error } = await sb.from('pricebook_learned_links').insert({ service_item_id: e.sid, part_name: e.pn, times_seen: e.n, status: 'suggested' }); if (!error) added++; }
    } catch (_) {}
  }
  return { added, updated };
}

// ── Phase 2: reprice the stalest confirmed parts (hard SerpAPI budget cap) ───────────────────────
export async function repriceStaleParts(sb, { limit = 30 } = {}) {
  let links = [];
  try {
    const { data } = await sb.from('pricebook_learned_links')
      .select('id, part_name, part_item_id, vendor_checked_at')
      .eq('status', 'confirmed')
      .order('vendor_checked_at', { ascending: true, nullsFirst: true })
      .limit(limit);
    links = data || [];
  } catch (_) { return { priced: 0, barcodes: 0 }; }
  let priced = 0, barcodes = 0;
  for (const l of links) {
    const r = await vendorPrices(l.part_name);
    if (!r.ok || !r.sellers.length) { try { await sb.from('pricebook_learned_links').update({ vendor_checked_at: nowISO() }).eq('id', l.id); } catch (_) {} continue; }
    const best = r.sellers[0];
    await sb.from('pricebook_learned_links').update({ vendor_seller: best.seller || null, vendor_price: r.cheapest ?? best.price, vendor_url: best.link || null, vendor_checked_at: nowISO() }).eq('id', l.id);
    priced++;
    if (l.part_item_id) {
      try {
        const { data: bcs } = await sb.from('pricebook_barcodes').select('id, vendor_seller').eq('item_id', l.part_item_id);
        for (const b of (bcs || [])) {
          const vkey = (b.vendor_seller || '').toLowerCase().split(' ')[0];
          const match = vkey && r.sellers.find((s) => (s.seller || '').toLowerCase().includes(vkey));
          if (match) { await sb.from('pricebook_barcodes').update({ unit_price: match.price, vendor_url: match.link || null, price_checked_at: nowISO() }).eq('id', b.id); barcodes++; }
        }
      } catch (_) {}
    }
  }
  return { priced, barcodes };
}

// ── Phase 3: flag services whose live parts cost outran the baked cost → PENDING owner approval ───
export async function flagPartCostGaps(sb, { thresholdPct = 8 } = {}) {
  let links = [];
  try { const { data } = await sb.from('pricebook_learned_links').select('service_item_id, vendor_price, quantity').eq('status', 'confirmed').gt('vendor_price', 0).limit(5000); links = data || []; } catch (_) { return { flagged: 0 }; }
  const liveBySvc = {};
  links.forEach((l) => { liveBySvc[l.service_item_id] = (liveBySvc[l.service_item_id] || 0) + Number(l.vendor_price) * (Number(l.quantity) || 1); });
  const ids = Object.keys(liveBySvc); if (!ids.length) return { flagged: 0 };
  let items = [];
  try { const { data } = await sb.from('pricebook_items').select('id, customer_name, name, retail_price, estimated_material_cost, target_margin_pct').in('id', ids); items = data || []; } catch (_) { return { flagged: 0 }; }
  // skip services that already have a pending request
  const pending = new Set();
  try { const { data } = await sb.from('pricebook_price_update_requests').select('item_id').eq('status', 'pending'); (data || []).forEach((r) => pending.add(r.item_id)); } catch (_) {}
  let flagged = 0;
  for (const it of items) {
    if (pending.has(it.id)) continue;
    const live = Math.round(liveBySvc[it.id] * 100) / 100;
    const baked = Number(it.estimated_material_cost) || 0;
    if (live <= baked * (1 + thresholdPct / 100)) continue; // cost hasn't meaningfully risen
    const retail = Number(it.retail_price) || 0;
    const target = Number(it.target_margin_pct) || DEFAULT_TARGET;
    const rec = priceForTargetMargin(live, target);
    if (!rec || rec <= retail) continue; // current price still holds the margin → no bump needed
    try {
      await sb.from('pricebook_price_update_requests').insert({
        item_id: it.id, old_price: retail, recommended_price: rec, old_cost: baked, new_cost: live,
        reason: `Live parts cost rose to $${live} (was $${baked} baked in). Raise to $${rec} to hold the ${target}% margin.`,
        source: 'parts-cost', status: 'pending',
      });
      flagged++;
    } catch (_) {}
  }
  return { flagged };
}

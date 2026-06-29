'use server';

import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can, canAny } from '@/lib/roles';
import { lensIdentify } from '@/lib/serpLens';
import { identifyFixture } from '@/lib/aiVision';
import { marginPct, marginHealth } from '@/lib/pricebookEngine';

// What words in a pricebook item name tie it to a fixture (so a toilet photo surfaces toilet work).
const FIXTURE_TERMS = {
  toilet: ['toilet', 'commode', 'water closet', 'flapper', 'fill valve', 'flush valve', 'wax ring', 'flange', 'bowl', 'tank'],
  faucet: ['faucet', 'spigot', 'cartridge', 'aerator', 'tap', 'mixer', 'stem'],
  sink: ['sink', 'basin', 'strainer', 'pop-up', 'drain assembly', 'disposal'],
  drain: ['drain', 'clog', 'snake', 'cable', 'auger', 'jet', 'stoppage', 'clear', 'rooter'],
  garbage_disposal: ['disposal', 'disposer', 'insinkerator', 'badger', 'garbage'],
  water_heater: ['water heater', 'heater', 'anode', 'element', 'thermostat', 't&p', 'expansion tank', 'flush'],
  tankless: ['tankless', 'water heater', 'navien', 'rinnai', 'descal', 'flush'],
  shower: ['shower', 'valve', 'cartridge', 'diverter', 'mixing', 'trim', 'head'],
  tub: ['tub', 'bathtub', 'overflow', 'spout', 'diverter', 'drain'],
  sump_pump: ['sump', 'pump', 'pit', 'check valve', 'battery backup'],
  water_softener: ['softener', 'resin', 'brine', 'conditioner', 'filter'],
  supply_line: ['supply', 'shutoff', 'stop', 'angle stop', 'braided', 'line'],
  valve: ['valve', 'shutoff', 'stop', 'gate', 'ball valve', 'prv'],
  p_trap: ['p-trap', 'trap', 'tubular', 'waste', 'drain'],
  sewer_line: ['sewer', 'main line', 'cleanout', 'camera', 'jet', 'excavat', 'line'],
  other: [],
};
const REPLACE_RE = /\b(replace|replacement|install|installation|new|upgrade|swap)\b/i;
const REPAIR_RE = /\b(repair|rebuild|service|reseat|reset|seal|tune|clear|snake|cable|auger|jet|descal|fix|adjust|kit|cartridge|flush|unclog)\b/i;

const BUCKET = 'pricebook-photos';
const STOP = new Set(['the', 'and', 'for', 'with', 'inch', 'new', 'set', 'kit', 'pack', 'genuine', 'oem', 'replacement', 'parts', 'part', 'home', 'depot', 'lowes', 'amazon', 'ebay', 'walmart', 'menards', 'ferguson', 'supply']);
// Clean a Lens guess down to a learnable phrase (drop vendors/filler, keep the meaningful words).
const cleanGuess = (g) => String(g || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).slice(0, 6).join(' ').trim();

async function ctx() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: 'Sign in required.' };
  const profile = await loadProfile(user);
  if (!(can(profile.role, 'changeStatus') || can(profile.role, 'seeOwnOnly') || can(profile.role, 'seeCrew') || can(profile.role, 'seeAllJobs') || can(profile.role, 'manageInventory')))
    return { err: 'Not allowed.' };
  return { user, profile, sb: getSupabaseAdmin() };
}

// Score pricebook items against the Lens guess (word overlap on name + aliases), return the best "fixes".
async function matchFixes(sb, guess, showCost) {
  const words = String(guess || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return [];
  let items = [];
  try { const { data } = await sb.from('pricebook_items').select('id, name, customer_name, retail_price, estimated_material_cost, target_margin_pct, category_id').eq('active', true).limit(2000); items = data || []; } catch (_) { return []; }
  const cleaned = cleanGuess(guess);
  let aliasByItem = {}, learnedByItem = {};
  try { const { data } = await sb.from('pricebook_item_aliases').select('item_id, phrase, source').eq('active', true); (data || []).forEach((a) => { (aliasByItem[a.item_id] = aliasByItem[a.item_id] || []).push(a.phrase); if (a.source === 'lens_learned') (learnedByItem[a.item_id] = learnedByItem[a.item_id] || []).push(String(a.phrase).toLowerCase()); }); } catch (_) {}

  const scored = items.map((it) => {
    const hay = `${it.name} ${it.customer_name || ''} ${(aliasByItem[it.id] || []).join(' ')}`.toLowerCase();
    let score = 0; words.forEach((w) => { if (hay.includes(w)) score += 1; });
    // bias toward repair/replace items (the "fix")
    if (/repair|replace|rebuild|install|service/i.test(it.name)) score += 0.5;
    // 🧠 learned: a previously-confirmed Lens phrase for this item that matches → big boost (instant match).
    if ((learnedByItem[it.id] || []).some((p) => p && (cleaned.includes(p) || p.includes(cleaned)))) score += 6;
    return { it, score };
  }).filter((x) => x.score >= 1).sort((a, b) => b.score - a.score).slice(0, 5);

  return scored.map(({ it }) => ({
    id: it.id, name: it.customer_name || it.name, price: Number(it.retail_price) || 0,
    ...(showCost ? { marginPct: marginPct(it), marginHealth: marginHealth(it) } : {}),
  }));
}

// 📸 Identify a part from a photo → Lens matches + the matching pricebook fixes.
export async function identifyPart(formData) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const file = formData.get('photo');
  if (!file || typeof file.arrayBuffer !== 'function' || !/^image\//.test(file.type || '')) return { ok: false, msg: 'Take a photo first.' };
  if (file.size > 12 * 1024 * 1024) return { ok: false, msg: 'Photo over 12 MB.' };

  try { await c.sb.storage.createBucket(BUCKET, { public: true }); } catch (_) {}
  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const key = `identify/${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const up = await c.sb.storage.from(BUCKET).upload(key, bytes, { contentType: file.type, upsert: false });
  if (up.error) return { ok: false, msg: up.error.message };
  const photoUrl = c.sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

  const lens = await lensIdentify(photoUrl);
  if (!lens.ok) return { ok: false, msg: lens.msg, photoUrl };

  const showCost = canAny(c.profile.role, ['seeFinancials']);
  const fixes = await matchFixes(c.sb, lens.guess, showCost);

  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'part.identify', entity: 'pricebook', entity_id: '', detail: { guess: lens.guess, fixes: fixes.length } }); } catch (_) {}
  return { ok: true, photoUrl, guess: lens.guess, matches: lens.matches, fixes };
}

// 📸 Scan the pricebook (Claude Vision) — identify the fixture in the photo, then surface its REPAIRS and its
// REPLACEMENTS from OUR pricebook, with a "best" to highlight. No SerpAPI/quota — one fast Vision call.
export async function scanFixtureRepairs(dataUrl) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const fx = await identifyFixture(String(dataUrl || ''), c.profile.role);
  if (!fx) return { ok: false, msg: 'Couldn’t read that photo — try the type-in search below, or a clearer shot. (AI may be off for your role.)' };
  const terms = (FIXTURE_TERMS[fx.fixture] || []).concat(String(fx.label || '').toLowerCase().split(/\s+/).filter((w) => w.length > 2));

  let items = [];
  try { const { data } = await c.sb.from('pricebook_items').select('id, name, customer_name, retail_price, estimated_material_cost, target_margin_pct').eq('active', true).limit(2000); items = data || []; } catch (_) {}
  let aliasByItem = {};
  try { const { data } = await c.sb.from('pricebook_item_aliases').select('item_id, phrase').eq('active', true); (data || []).forEach((a) => { (aliasByItem[a.item_id] = aliasByItem[a.item_id] || []).push(String(a.phrase).toLowerCase()); }); } catch (_) {}

  const scored = items.map((it) => {
    const hay = `${it.name} ${it.customer_name || ''} ${(aliasByItem[it.id] || []).join(' ')}`.toLowerCase();
    let score = 0; terms.forEach((t) => { if (t && hay.includes(t)) score += 1; });
    return { it, hay, score };
  }).filter((x) => x.score >= 1).sort((a, b) => b.score - a.score);

  const showCost = canAny(c.profile.role, ['seeFinancials']);
  const toLine = (it) => ({ id: it.id, name: it.customer_name || it.name, price: Number(it.retail_price) || 0, ...(showCost ? { marginPct: marginPct(it), marginHealth: marginHealth(it) } : {}) });
  const repairs = [], replacements = [];
  for (const { it, hay } of scored) {
    const isReplace = REPLACE_RE.test(hay) && !/repair|rebuild/i.test(hay);
    if (isReplace) { if (replacements.length < 5) replacements.push(toLine(it)); }
    else if (repairs.length < 6) repairs.push(toLine(it)); // repair-tagged OR default → repairs
    if (repairs.length >= 6 && replacements.length >= 5) break;
  }
  // Best = the top replacement (the upgrade play) → else the top repair. The UI glows it.
  const best = replacements[0] || repairs[0] || null;
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'fixture.scan', entity: 'pricebook', entity_id: '', detail: { fixture: fx.fixture, repairs: repairs.length, replacements: replacements.length } }); } catch (_) {}
  return { ok: true, fixture: fx.fixture, label: fx.label, problem: fx.problem, confidence: fx.confidence, repairs, replacements, bestId: best ? best.id : null };
}

// 🧠 Teach the library: this Lens guess → this pricebook fix. Stored as a learned alias so next time the
// same part is recognized instantly (reuses pricebook_item_aliases — no new table). The crew compounds it.
export async function learnPartFix(guess, itemId) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  const phrase = cleanGuess(guess);
  if (!phrase || !itemId) return { ok: false, msg: 'Nothing to learn.' };
  try { await c.sb.from('pricebook_item_aliases').insert({ item_id: itemId, phrase, source: 'lens_learned', confidence: 85 }); } catch (_) { /* duplicate phrase = already learned, fine */ }
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'part.learn', entity: 'pricebook_item', entity_id: String(itemId), detail: { phrase } }); } catch (_) {}
  return { ok: true, msg: 'Learned — I’ll know it next time.' };
}

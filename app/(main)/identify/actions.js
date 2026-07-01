'use server';

import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadProfile } from '@/lib/profile';
import { can, canAny } from '@/lib/roles';
import { lensIdentify } from '@/lib/serpLens';
import { identifyFixture, identifyFixtures } from '@/lib/aiVision';
import { marginPct, marginHealth } from '@/lib/pricebookEngine';

// What words in a pricebook item name tie it to a fixture (so a toilet photo surfaces toilet work).
const FIXTURE_TERMS = {
  toilet: ['toilet', 'commode', 'water closet', 'flapper', 'fill valve', 'flush valve', 'wax ring', 'flange', 'bowl', 'tank'],
  faucet: ['faucet', 'spigot', 'cartridge', 'aerator', 'tap', 'mixer', 'stem'],
  sink: ['sink', 'basin', 'strainer', 'pop-up', 'drain assembly', 'disposal'],
  drain: ['drain', 'clog', 'snake', 'cable', 'auger', 'jet', 'stoppage', 'clear', 'rooter'],
  floor_drain: ['drain', 'floor drain', 'area drain', 'main', 'main line', 'cleanout', 'snake', 'cable', 'auger', 'jet', 'rooter', 'stoppage', 'clear', 'camera', 'sewer'],
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
// Special / apartment / contract pricing — named "… Contract Rate" in the book. NEVER surface it in the
// standard camera scan (it's negotiated pricing for specific accounts, quoted by the office).
const CONTRACT_RE = /\bcontract\b|contract rate|account rate|special rate/i;
// Situational SPECIALTY products — only right for a specific setup (no gravity drain / basement). A Saniflo
// is the priciest "toilet" item so it kept winning "Best" on every toilet scan (Devin). Don't surface these
// on a normal scan; the tech adds them by hand via type-in when the situation actually calls for it.
const SPECIALTY_RE = /saniflo|sani-?flo|macerat|up-?flush\b|upflush|sewage ejector|ejector pump|grinder pump/i;
// Drain-clearing words — when the AI says a fixture is CLOGGED, the fix is clearing it (auger/snake), so we
// pull these in even on a toilet/sink scan (whose part-words don't include them).
const CLEAR_TERMS = ['auger', 'snake', 'cable', 'clear', 'stoppage', 'unclog', 'rooter', 'jet', 'closet auger'];
const CLEAR_RE = /auger|snake|cable|stoppage|unclog|rooter|\bclear\b|\bjet\b|rodding|main ?line|cleanout|camera/i;
const CLOG_RE = /clog|stoppage|back(ed|ing)?\s*up|back-?up|overflow|won'?t flush|wont flush|not flush|plug|stopped up|won'?t drain|slow|standing water|holding water|full of water|gurgl|sewage|backing|rising|rooter/i;
// A floor / area / basement drain or the main line — the LOW POINT. When one of these backs up it's usually
// a MAIN-LINE blockage (water rises to the lowest opening), so the right call leans cable/jet + camera.
const LOWPOINT_RE = /floor ?drain|area ?drain|basement drain|main ?line|sewer|cleanout/i;
// Main-line work — only the right "clear" for a LOW-POINT fixture. A toilet/sink/tub clog is LOCAL (auger),
// so we keep main-line items out of those clog ladders (else the priciest hydro-jet wrongly wins "Best").
const MAINLINE_RE = /main ?line|\bsewer\b|cleanout|camera|hydro.?jet|jet the main/i;

// Turn a price-sorted list into a Good / Better / Best ladder (cheapest = Good, priciest = Best, middle =
// Better) + the rest as "more". Cheapest repair (flapper/fill valve) → Good; biggest (major rebuild) → Best.
function gbbLadder(list) {
  const s = [...(list || [])].sort((a, b) => (a.price || 0) - (b.price || 0));
  if (!s.length) return null;
  if (s.length === 1) return { best: s[0], more: [] };
  if (s.length === 2) return { good: s[0], best: s[1], more: [] };
  const mid = Math.floor((s.length - 1) / 2);
  const used = new Set([0, mid, s.length - 1]);
  return { good: s[0], better: s[mid], best: s[s.length - 1], more: s.filter((_, i) => !used.has(i)) };
}

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

// 🏪 Adaptive part sourcing — where can they get this RIGHT NOW, closest-first: the scanning tech's OWN van,
// then the shop (Reid's), then other vans. Live qty from truck_inventory. Beats an Amazon link on a same-day
// job. Re-runs every scan against current stock, so it always reflects what's actually on hand.
async function findInStock(sb, guess, myName) {
  const words = String(guess || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return [];
  let rows = [];
  try { const { data } = await sb.from('truck_inventory').select('tech_name, sku, name, qty').gt('qty', 0).limit(3000); rows = data || []; } catch (_) { return []; }
  const myFirst = String(myName || '').toLowerCase().split(/\s+/)[0] || '';
  const isShop = (t) => /shop|reed|reid|warehouse|\bdc\b|main office/i.test(String(t || ''));
  const isMine = (t) => myFirst && String(t || '').toLowerCase().includes(myFirst);
  const scored = rows.map((r) => {
    const hay = `${r.name || ''} ${r.sku || ''}`.toLowerCase();
    let s = 0; words.forEach((w) => { if (hay.includes(w)) s += 1; });
    return { r, s };
  }).filter((x) => x.s >= 1);
  const rank = (r) => (isMine(r.tech_name) ? 0 : isShop(r.tech_name) ? 1 : 2); // own van → shop → other vans
  scored.sort((a, b) => rank(a.r) - rank(b.r) || b.s - a.s || (Number(b.r.qty) || 0) - (Number(a.r.qty) || 0));
  return scored.slice(0, 8).map(({ r }) => ({ where: r.tech_name || 'Stock', name: r.name, sku: r.sku || null, qty: Number(r.qty) || 0, mine: isMine(r.tech_name), shop: isShop(r.tech_name) }));
}

// 📸 Identify a part from a photo → Lens matches + the matching pricebook fixes + who's got it in stock.
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
  const inStock = await findInStock(c.sb, lens.guess, c.profile.name); // 🏪 your van → shop → other vans (live)

  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'part.identify', entity: 'pricebook', entity_id: '', detail: { guess: lens.guess, fixes: fixes.length } }); } catch (_) {}
  return { ok: true, photoUrl, guess: lens.guess, matches: lens.matches, fixes, inStock };
}

const ladderHas = (l) => l && (l.good || l.better || l.best);

// Build the Repairs + Replacements GBB ladders for ONE identified fixture against the (already-loaded) book.
function buildFixtureRecs(fx, items, aliasByItem, showCost) {
  // Did the AI see a clog/stoppage? Then the FIX is clearing it (auger), so pull in the clearing words too —
  // the fixture's own part-words (flapper/fill valve) don't include them.
  const isClog = CLOG_RE.test(`${fx.problem || ''} ${fx.label || ''}`);
  const baseTerms = (FIXTURE_TERMS[fx.fixture] || []).concat(String(fx.label || '').toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const terms = isClog ? baseTerms.concat(CLEAR_TERMS) : baseTerms;

  const scored = items.map((it) => {
    const hay = `${it.name} ${it.customer_name || ''} ${(aliasByItem[it.id] || []).join(' ')}`.toLowerCase();
    let score = 0; terms.forEach((t) => { if (t && hay.includes(t)) score += 1; });
    if (isClog && CLEAR_RE.test(hay)) score += 3; // a clog → lead with the clearing fix (auger), not the priciest rebuild
    return { it, hay, score };
  }).filter((x) => x.score >= 1).sort((a, b) => b.score - a.score);

  const toLine = (it) => ({ id: it.id, name: it.customer_name || it.name, price: Number(it.retail_price) || 0, ...(showCost ? { marginPct: marginPct(it), marginHealth: marginHealth(it) } : {}) });
  const repairsAll = [], replacementsAll = [];
  for (const { it, hay } of scored) {
    if (CONTRACT_RE.test(hay)) continue;  // special/apartment "Contract Rate" pricing — never leak into the scan
    if (SPECIALTY_RE.test(hay)) continue; // Saniflo / ejector / grinder — situational, never the default scan rec
    const isReplace = REPLACE_RE.test(hay) && !/repair|rebuild/i.test(hay);
    if (isReplace) { if (replacementsAll.length < 10) replacementsAll.push(toLine(it)); }
    else if (repairsAll.length < 12) repairsAll.push(toLine(it)); // repair-tagged OR default → repairs
  }
  // On a clog, the REPAIR is clearing it → show the auger/clearing options as the repairs ladder (not the
  // part-rebuilds). For a LOCAL fixture (toilet/sink/tub) keep main-line work out so a hydro-jet doesn't win
  // "Best"; for a LOW POINT (floor drain/main) main-line clearing IS the right answer, so leave it in.
  const isLowPoint = LOWPOINT_RE.test(`${fx.fixture} ${fx.label || ''}`);
  let repairsForLadder = repairsAll;
  if (isClog) {
    let clearOnly = repairsAll.filter((r) => CLEAR_RE.test(r.name.toLowerCase()));
    if (!isLowPoint) clearOnly = clearOnly.filter((r) => !MAINLINE_RE.test(r.name.toLowerCase()));
    if (clearOnly.length) repairsForLadder = clearOnly;
  }
  const repairs = gbbLadder(repairsForLadder);
  const replacements = gbbLadder(replacementsAll);
  const mainLineHint = (isClog && isLowPoint) ? 'Low point + standing water = usually a MAIN-LINE backup, not a local clog. Cable/jet the main line + run a camera — don’t stop at a small snake.' : null;
  return { fixture: fx.fixture, label: fx.label, problem: fx.problem, confidence: fx.confidence, isClog, mainLineHint, repairs, replacements, hasResults: !!(ladderHas(repairs) || ladderHas(replacements)) };
}

// 📸 Scan the pricebook (Claude Vision) — identify EVERY fixture/component in the photo (the disposal + the
// P-trap + supplies + shutoffs…), and surface each one's REPAIRS and REPLACEMENTS from OUR pricebook. One
// Vision call. Returns { ok, fixtures:[…] } — one section per fixture; top-level mirrors the first for back-compat.
export async function scanFixtureRepairs(dataUrl) {
  const c = await ctx(); if (c.err) return { ok: false, msg: c.err };
  let fxList = await identifyFixtures(String(dataUrl || ''), c.profile.role);
  if (!fxList || !fxList.length) { const one = await identifyFixture(String(dataUrl || ''), c.profile.role); fxList = one ? [one] : null; }
  if (!fxList || !fxList.length) return { ok: false, msg: 'Couldn’t read that photo — try the type-in search below, or a clearer shot. (AI may be off for your role.)' };

  let items = [];
  try { const { data } = await c.sb.from('pricebook_items').select('id, name, customer_name, retail_price, estimated_material_cost, target_margin_pct').eq('active', true).limit(2000); items = data || []; } catch (_) {}
  let aliasByItem = {};
  try { const { data } = await c.sb.from('pricebook_item_aliases').select('item_id, phrase').eq('active', true); (data || []).forEach((a) => { (aliasByItem[a.item_id] = aliasByItem[a.item_id] || []).push(String(a.phrase).toLowerCase()); }); } catch (_) {}
  const showCost = canAny(c.profile.role, ['seeFinancials']);

  const fixtures = fxList.map((fx) => buildFixtureRecs(fx, items, aliasByItem, showCost));
  try { await c.sb.from('audit_log').insert({ actor_id: c.user.id, actor_name: c.profile.name || c.user.email, role: c.profile.role, action: 'fixture.scan', entity: 'pricebook', entity_id: '', detail: { count: fixtures.length, fixtures: fixtures.map((f) => f.fixture) } }); } catch (_) {}
  const primary = fixtures[0] || {};
  return { ok: true, fixtures, ...primary }; // top-level = primary fixture, for back-compat with single-section callers
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

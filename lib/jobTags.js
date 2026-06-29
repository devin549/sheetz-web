// High-signal My Day tags — ONLY tags that change tech behavior or office risk. Derived from real job +
// customer data. Color by type: risk red/orange · preference blue · money/billing green/gold. Sorted so
// the most important (risk → money → preference) show first; the card caps at 4 + "+N more".
// tone: 'red' | 'orange' | 'blue' | 'green' | 'gold'  (priority weight: red<orange<gold<green<blue)
const WEIGHT = { red: 0, orange: 1, gold: 2, green: 3, blue: 4 };

export function deriveTags(job, ctx = {}) {
  const t = `${job.job_type || ''}`.toLowerCase();
  const cls = `${job.job_class || ''}`.toLowerCase();
  const notes = `${job.access_notes || ''} ${job.notes || ''}`.toLowerCase();
  const tags = [];
  const add = (key, label, tone, why) => tags.push({ key, label, tone, why });

  // ── Risk (red/orange) ──
  if (/callback|re-?clog|re-?do/.test(t + ' ' + notes)) add('callback', 'Callback', 'red', 'Repeat issue from a prior visit — be extra clear and thorough; a 2nd callback can dock pay.');
  if (ctx.pastDue > 0) add('pastdue', 'Past Due', 'red', `Customer owes ${'$' + Number(ctx.pastDue).toLocaleString(undefined, { maximumFractionDigits: 0 })} — collect before new work if policy requires.`);
  if (/install|excavat|dig|gas|sewer|main|water ?heater|repipe/.test(t)) add('permit', 'Permit Required', 'orange', 'This work likely needs a pulled permit before you start.');
  if (/excavat|dig|main|sewer ?replace|repipe/.test(t) || /helper/.test(notes)) add('helper', 'Helper Needed', 'orange', 'Heavy/2-person job — confirm your helper before you roll.');
  if (/special order|order part|parts? needed|backorder/.test(notes)) add('parts', 'Parts Needed', 'orange', 'Parts must be picked up / on the truck — check before heading out.');
  if (/water ?heater|furnace|boiler|tankless|softener|condenser/.test(t)) add('equipment', 'Equipment Needed', 'orange', 'Equipment install/swap — bring the unit + fittings, snap the data plate.');
  if (cls === 'commercial' || /\bpo\b|net ?30|purchase order/.test(notes)) add('po', 'PO Required', 'gold', 'Commercial / billing job — get the PO number; do not collect cash on site.');

  // ── Money / opportunity (green/gold) ──
  if (ctx.vip) add('vip', 'VIP', 'gold', 'Top-tier / VIP customer — white-glove service, they refer others. Don’t rush.');
  if (ctx.member && !ctx.vip) add('member', 'Member', 'green', 'Active member — priority service, member pricing.');
  if (/warranty|insurance/.test(cls) || job.warranty_provider) add('warranty', 'Warranty', 'green', 'Warranty/insurance job — use the claim form, follow the provider workflow.');
  if (cls === 'estimate' || /estimate|quote|bid/.test(t)) add('estimate', 'Estimate Only', 'gold', 'Quote visit — present options + set the outcome; no full closeout required.');
  if (/project|repipe|remodel|replacement/.test(t) || (Number(job.amount) || 0) > 2500) add('project', 'Project', 'gold', 'Bigger project — slow down, present good/better/best, watch margin.');
  if (/flood|water damage|restoration|mold|burst|overflow/.test(t + ' ' + notes)) add('flood', 'FloodBusterz Opp', 'gold', 'Possible water damage — FloodBusterz restoration upsell (drying, mitigation). Flag it.');
  if (/reline|cast iron|root intrusion|recurring|cracked|belly/.test(t + ' ' + notes)) add('reline', 'Reline Opp', 'gold', 'Recurring/old pipe — pipe-lining or replacement opportunity. Scope it + quote.');

  // ── Preference / access (blue) ──
  if (/dog|pet/.test(notes)) add('dogs', 'Dogs', 'blue', 'Pets on site — announce yourself, watch the gate.');
  if (/gate|code|lockbox/.test(notes)) add('gate', 'Gate Code', 'blue', 'Gated/locked access — the code/lockbox is in the notes.');
  if (/prefer.*text|text.*prefer|texts? (only|preferred)/.test(notes)) add('text', 'Prefers Text', 'blue', 'Customer prefers texts over calls.');

  return tags.sort((a, b) => (WEIGHT[a.tone] ?? 9) - (WEIGHT[b.tone] ?? 9));
}

// ── Office-authored tags ────────────────────────────────────────────────────────────────────────────
// Free-text labels the office puts on a job (jobs.office_tags). Shown on the My Day card next to the derived
// ones, and some TRIGGER a form (water-heater tag → Water Heater Install form, etc.).
export const OFFICE_TAG_FORMS = [
  { re: /water ?heater|tankless/i,                form: ['🔥 Water Heater Install form', 'Model/serial, fuel type, T&P + expansion tank, permit.', true] },
  { re: /\bgas\b|propane|\blp\b/i,                 form: ['⛽ Gas line form', 'Pressure test + leak check + permit.', true] },
  { re: /backflow/i,                               form: ['🔄 Backflow test report', 'Certified test results + serials.', true] },
  { re: /sump|ejector|lift ?station/i,             form: ['💧 Sump / ejector form', 'Pump model, float test, basin check.', true] },
  { re: /repipe|re-?pipe/i,                         form: ['🚿 Repipe scope form', 'Material, fixtures, permit, restoration.', true] },
  { re: /excavat|\bdig\b|sewer ?replace|main ?line/i, form: ['🪏 Excavation form', '811 locate, depth, restoration, permit.', true] },
  { re: /softener|filtration|reverse osmosis|\bro\b/i, form: ['🧂 Water treatment form', 'Grains, bypass, drain, model/serial.', true] },
];

// Forms triggered by a job's office tags — [label, why, required]. Deduped.
export function formsForTags(officeTags = []) {
  const text = (Array.isArray(officeTags) ? officeTags : []).join(' ');
  const seen = new Set(), out = [];
  for (const { re, form } of OFFICE_TAG_FORMS) { if (re.test(text) && !seen.has(form[0])) { seen.add(form[0]); out.push(form); } }
  return out;
}

// Pick a card color for a free-text office tag (so it reads like the derived ones).
function officeTone(label) {
  const s = String(label).toLowerCase();
  if (/proof|callback|past ?due|owe|do ?not|dnc|fraud|careful|aggress|hazard/.test(s)) return 'red';
  if (/permit|helper|parts|order|water ?heater|\bgas\b|excavat|backflow|sump|repipe/.test(s)) return 'orange';
  if (/no ?balance|paid|member|vip|warranty/.test(s)) return 'green';
  if (/\bpo\b|net ?30|commercial|estimate|project/.test(s)) return 'gold';
  return 'blue'; // gate code / dogs / prefers text / access = preference
}

// Office tags → card pills (merge with deriveTags output). Marked office:true so the card can badge them.
export function officeTagPills(officeTags = []) {
  return (Array.isArray(officeTags) ? officeTags : []).filter((t) => String(t || '').trim()).slice(0, 12)
    .map((label, i) => ({ key: 'oct' + i, label: String(label).trim().slice(0, 40), tone: officeTone(label), office: true, why: 'Set by the office for this job.' }));
}

export const TAG_COLOR = {
  red: { bg: 'rgba(239,83,80,.14)', fg: 'var(--red)', bd: 'var(--red)' },
  orange: { bg: 'rgba(255,138,61,.14)', fg: '#ff8a3d', bd: '#ff8a3d' },
  gold: { bg: 'rgba(255,179,0,.14)', fg: 'var(--amber)', bd: 'var(--amber-dim)' },
  green: { bg: 'rgba(70,193,120,.14)', fg: 'var(--green)', bd: 'var(--green)' },
  blue: { bg: 'rgba(88,166,255,.14)', fg: '#58a6ff', bd: '#58a6ff' },
};

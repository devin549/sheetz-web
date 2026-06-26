// Simulate Devin's scenario: 22 techs, board ~60% full, 2-hour booking notice, best-tech pick. Pure test.
const norm = (s) => String(s || '').toLowerCase();
function rankTechs(techs, { jobType = '', city = '', busyTechIds = new Set(), techLoad = {} } = {}) {
  const jt = norm(jobType);
  return techs.filter((t) => !busyTechIds.has(t.id)).map((t) => {
    let score = 0; const reasons = [];
    if ((t.skills || []).some((s) => s && jt.includes(norm(s)))) { score += 5; reasons.push('skill'); }
    if (t.area && city && norm(city).includes(norm(t.area))) { score += 3; reasons.push('nearby'); }
    const load = techLoad[t.id] || 0; score += Math.max(0, 6 - load);
    return { tech: t, score, load, reasons };
  }).sort((a, b) => b.score - a.score || a.load - b.load);
}

// 22 techs with rotating skills + home towns.
const SKILLS = [['water heater'], ['drain', 'sewer'], ['toilet', 'faucet'], ['water heater', 'tankless'], ['sewer', 'excavation'], ['drain']];
const TOWNS = ['Richmond', 'Lexington', 'Berea', 'Nicholasville', 'Winchester', 'Mount Vernon'];
const techs = Array.from({ length: 22 }, (_, i) => ({ id: 't' + i, name: 'Tech ' + (i + 1), skills: SKILLS[i % SKILLS.length], area: TOWNS[i % TOWNS.length] }));
const WINDOWS = ['8–10', '10–12', '12–2', '2–4', '4–6'];

// ~60% of the board full: tech i is busy in window w if (i*3 + w*7) % 10 < 6. Build per-window busy sets + load.
const busyByWindow = {}; const techLoad = {};
WINDOWS.forEach((w, wi) => { const s = new Set(); techs.forEach((t, i) => { if ((i * 3 + wi * 7) % 10 < 6) { s.add(t.id); techLoad[t.id] = (techLoad[t.id] || 0) + 1; } }); busyByWindow[w] = s; });

const fmt = (n) => n.toString().padStart(2);
console.log('=== Board: 22 techs · ' + WINDOWS.length + ' windows ===');
let totalSlots = 0, busySlots = 0;
WINDOWS.forEach((w) => { const free = 22 - busyByWindow[w].size; totalSlots += 22; busySlots += busyByWindow[w].size; console.log(`  ${w.padEnd(6)}  ${fmt(busyByWindow[w].size)} busy · ${fmt(free)} FREE  ${free > 0 ? '🟢 open' : '🔴 FULL'}`); });
console.log(`  board fill: ${Math.round(busySlots / totalSlots * 100)}%\n`);

// 2-hour notice: a customer booking now at 9:00 — the 8–10 window (starts in the past) and anything <2h is closed.
const nowHour = 9; const winStart = { '8–10': 8, '10–12': 10, '12–2': 12, '2–4': 14, '4–6': 16 };
console.log('=== Booking at ' + nowHour + ':00 with 2-hour notice (today) ===');
WINDOWS.forEach((w) => { const ok = winStart[w] >= nowHour + 2; console.log(`  ${w.padEnd(6)} ${ok ? 'bookable' : 'too soon (2h notice)'}`); });

// Best tech for: Water heater install in Nicholasville, the 10–12 window.
console.log('\n=== Best tech for "Water heater install" in Nicholasville · 10–12 ===');
const ranked = rankTechs(techs, { jobType: 'water heater install', city: 'Nicholasville', busyTechIds: busyByWindow['10–12'], techLoad });
console.log(`  ${ranked.length} techs free this window. Top picks:`);
ranked.slice(0, 4).forEach((r, i) => console.log(`   ${i + 1}. ${r.tech.name} — ${r.tech.skills.join('/')} · ${r.tech.area} · load ${r.load} → score ${r.score} ${r.reasons.length ? '(' + r.reasons.join(', ') + ')' : ''}`));
console.log('\n  → AUTO-PICK: ' + (ranked[0] ? ranked[0].tech.name + ' (' + (ranked[0].reasons.join(', ') || 'lightest load') + ')' : 'none — office handles'));

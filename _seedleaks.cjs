// Seed costed CLOSED jobs so Leak Radar has history to learn from + leaks to flag.
// Run:  node _seedleaks.cjs          (seed)
//       node _seedleaks.cjs --clean  (remove every SEEDLEAK row)
// Tagged 'SEEDLEAK' in notes for trivial cleanup. Idempotent-ish: --clean first if re-running.
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TAG = 'SEEDLEAK';
const C = (d) => Math.round(d * 100); // dollars → cents

// type, count of CLEAN jobs, [revLo,revHi] ticket, [matLo,matHi] parts $  → builds a healthy baseline.
const TYPES = [
  { type: 'Drain Clog', n: 8, rev: [380, 460], mat: [60, 95], tech: 'Dewey Cheatham' },
  { type: 'Water Heater Install', n: 6, rev: [2450, 2950], mat: [880, 1080], tech: 'Marcus Welby' },
  { type: 'Toilet Reset', n: 6, rev: [220, 270], mat: [28, 52], tech: 'Roto Romano' },
];
// Deliberate leaks (one of each detector).
const LEAKS = [
  { type: 'Drain Clog', amount: 150, mat: 55, tech: 'Slick Rick', why: 'underbilled' },
  { type: 'Drain Clog', amount: 430, mat: 300, tech: 'Slick Rick', why: 'padded parts + thin margin' },
  { type: 'Water Heater Install', amount: 2500, mat: 1450, tech: 'Marcus Welby', why: 'thin margin (44%)' },
  { type: 'Toilet Reset', amount: 245, mat: 0, tech: 'Ghost Tech', why: 'no cost entered' },
];
const rand = (lo, hi, i, n) => Math.round(lo + ((hi - lo) * (i + 0.5)) / n); // spread, deterministic (no Math.random)

(async () => {
  if (process.argv.includes('--clean')) {
    const { error, count } = await sb.from('jobs').delete({ count: 'exact' }).ilike('notes', `%${TAG}%`);
    console.log(error ? 'clean error: ' + error.message : `cleaned ${count} SEEDLEAK jobs`);
    return;
  }

  // one customer to attach (FK may be NOT NULL)
  let custId = null;
  const cu = await sb.from('customers').insert({ name: 'Leak Demo Customer ' + TAG, address: 'Richmond, KY' }).select('id').single();
  if (!cu.error) custId = cu.data.id; else console.log('customer note:', cu.error.message);

  const rows = [];
  let seq = 9000;
  for (const t of TYPES) {
    for (let i = 0; i < t.n; i++) {
      rows.push({ job_number: 'CB-' + seq++, job_type: t.type, status: 'done',
        amount: rand(t.rev[0], t.rev[1], i, t.n), material_cost_cents: C(rand(t.mat[0], t.mat[1], i, t.n)),
        dispatch_fee_cents: 0, tech_name: t.tech, customer_id: custId, notes: `${TAG} clean ${t.type}` });
    }
  }
  for (const l of LEAKS) {
    rows.push({ job_number: 'CB-' + seq++, job_type: l.type, status: 'done',
      amount: l.amount, material_cost_cents: C(l.mat), dispatch_fee_cents: 0,
      tech_name: l.tech, customer_id: custId, notes: `${TAG} LEAK (${l.why})` });
  }

  let ok = 0, fail = 0;
  for (const r of rows) {
    const { error } = await sb.from('jobs').insert(r);
    if (error) { fail++; if (fail <= 3) console.error('job', r.job_number, error.message); }
    else ok++;
  }
  console.log(`seeded ${ok} closed jobs (${fail} failed) across ${TYPES.length} types + ${LEAKS.length} leaks. Open /leak-radar as a manager.`);
})();

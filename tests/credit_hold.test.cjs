// Safety-net for the credit-hold approver gate (lib/creditHold canOverrideCreditHold) — used by the booking
// gate AND the place/lift toggle. A held customer can only be booked/changed by owner/GM/accounting/OM;
// dispatch + CSR + field roles are blocked (no new work without approved terms).
// Run: node tests/credit_hold.test.cjs
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const root = path.resolve(__dirname, '..');
const out = path.join(os.tmpdir(), 'cb_credit.cjs');
execSync(`npx esbuild lib/creditHold.js --bundle --format=cjs --platform=node --alias:@=${root} --outfile=${out}`, { cwd: root, stdio: 'ignore' });
const { canOverrideCreditHold } = require(out);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };

// Blocked — see the hold, but must get approval to book/change.
for (const r of ['tech', 'helper', 'foreman', 'dispatcher', 'csr', 'office']) ok(`${r} CANNOT override a credit hold`, canOverrideCreditHold(r) === false);
// Approvers.
for (const r of ['om', 'gm', 'owner', 'accounting']) ok(`${r} may override a credit hold`, canOverrideCreditHold(r) === true);

console.log(`\n${fail ? '❌' : '✅'} credit_hold: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

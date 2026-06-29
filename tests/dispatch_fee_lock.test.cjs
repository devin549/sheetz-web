// Safety-net for the dispatch-fee lock in setJobCosts (job/[id]/actions.js). The dispatch fee is
// subtracted from a tech's commission base, so a FIELD earner (tech/helper, scoped to their own job by
// canViewJob) must not be able to lower it on their own job. This pins the exact gate the action uses:
//   canSetDispatch = !can(role,'seeOwnOnly') || can(role,'seeFinancials')
// If a future role-perm edit reopens the hole (e.g. a tech gains a perm that flips this), this fails.
// Run: node tests/dispatch_fee_lock.test.cjs
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const root = path.resolve(__dirname, '..');
const out = path.join(os.tmpdir(), 'cb_roles_fee.cjs');
execSync(`npx esbuild lib/roles.js --bundle --format=cjs --platform=node --alias:@=${root} --outfile=${out}`,
  { cwd: root, stdio: 'ignore' });
const { can } = require(out);

// The predicate must MATCH setJobCosts exactly.
const canSetDispatch = (role) => !can(role, 'seeOwnOnly') || can(role, 'seeFinancials');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };

// Field earners — BLOCKED from setting the dispatch fee on their own job.
for (const r of ['tech', 'helper']) ok(`${r} CANNOT set the dispatch fee`, canSetDispatch(r) === false);

// Office / dispatch / management — ALLOWED (they assign the fee).
for (const r of ['dispatcher', 'csr', 'office', 'om', 'foreman', 'gm', 'owner', 'accounting']) {
  ok(`${r} may set the dispatch fee`, canSetDispatch(r) === true);
}

console.log(`\n${fail ? '❌' : '✅'} dispatch_fee_lock: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Safety-net for the pricebook cross-job guard (scope.js). Proves the hole the night-crew audit found is
// closed: a field tech (seeOwnOnly) can only act on a job that is THEIRS — recordSale / logManualApproval /
// createEstimate / recordCustomEntry all route through scopeJob(). Run: node tests/pricebook_scope.test.cjs
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const out = path.join(require('os').tmpdir(), 'cb_scope_bundle.cjs');
execSync(
  `npx esbuild "app/(main)/job/[id]/pricebook/scope.js" --bundle --format=cjs --platform=node --alias:@=${root} --outfile=${out}`,
  { cwd: root, stdio: 'inherit' }
);
const { scopeJob } = require(out);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };

// Minimal sb stub: loadJob does .from('jobs').select(sel).eq('id', id).maybeSingle() and falls through
// tiers on error — returning a clean {data} on the first call satisfies it.
const sbFor = (job) => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: job, error: null }) }) }) }),
});
const techCtx = (techId, job) => ({
  user: { id: 'u1', email: 'tech@cb.com' },
  profile: { role: 'tech', tech_id: techId, name: 'Tech One', email: 'tech@cb.com' },
  sb: sbFor(job),
});

(async () => {
  // 1. Own job → allowed.
  const own = await scopeJob(techCtx('T1', { id: 'J1', tech_id: 'T1', tech_name: 'Tech One' }), 'J1');
  ok('tech may act on their OWN job', !own.err && own.job);

  // 2. Another tech's job → DENIED (the audit hole).
  const foreign = await scopeJob(techCtx('T1', { id: 'J2', tech_id: 'T2', tech_name: 'Other Tech' }), 'J2');
  ok('tech is BLOCKED from another tech\'s job', foreign.err === 'Not allowed for this job.');

  // 3. Blank jobId → rejected, no DB touch.
  const blank = await scopeJob(techCtx('T1', null), '');
  ok('blank jobId rejected', blank.err === 'No job specified.');

  // 4. Job not found → rejected.
  const gone = await scopeJob(techCtx('T1', null), 'J9');
  ok('missing job rejected', gone.err === 'Job not found.');

  // 5. A dispatcher / office role (seeAllJobs) clears any job.
  const office = {
    user: { id: 'u2', email: 'dispatch@cb.com' },
    profile: { role: 'dispatcher', name: 'Dispatch', email: 'dispatch@cb.com' },
    sb: sbFor({ id: 'J2', tech_id: 'T2' }),
  };
  const dispatch = await scopeJob(office, 'J2');
  ok('office (seeAllJobs) may act on any job', !dispatch.err && dispatch.job);

  try { fs.unlinkSync(out); } catch (_) {}
  console.log(`\n${fail ? '❌' : '✅'} pricebook_scope: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

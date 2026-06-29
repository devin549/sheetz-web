// Safety-net for the ETA report rules (lib/eta normalizeEta) wired into reportEta. Pins the owner-audit
// asks: no zero-minute plain ETA, every report needs a reason, help ping may be 0-min but still needs a note.
// Run: node tests/eta_validation.test.cjs
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const root = path.resolve(__dirname, '..');
const out = path.join(os.tmpdir(), 'cb_eta.cjs');
execSync(`npx esbuild lib/eta.js --bundle --format=cjs --platform=node --alias:@=${root} --outfile=${out}`, { cwd: root, stdio: 'ignore' });
const { normalizeEta } = require(out);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };

// Zero-minute plain ETA → rejected (the noise case).
ok('zero-min plain ETA rejected', normalizeEta({ minutes: 0, note: 'stuck', needsHelp: false }).ok === false);
// Plain ETA with minutes but NO reason → rejected.
ok('plain ETA without reason rejected', normalizeEta({ minutes: 30, note: '  ', needsHelp: false }).ok === false);
// Valid plain ETA → ok, normalized.
const good = normalizeEta({ minutes: 30, note: 'cable stuck', needsHelp: false });
ok('valid plain ETA accepted', good.ok === true && good.mins === 30 && good.reason === 'cable stuck');
// Help ping with 0 minutes is allowed — but still needs a note.
ok('help ping with no note rejected (the bad job)', normalizeEta({ minutes: 0, note: '', needsHelp: true }).ok === false);
ok('help ping with a note accepted at 0 min', normalizeEta({ minutes: 0, note: 'need a hand on the main', needsHelp: true }).ok === true);
// Minutes clamp to the 0–480 window.
ok('minutes clamped to 480', normalizeEta({ minutes: 99999, note: 'x', needsHelp: false }).mins === 480);
// Garbage minutes coerce to 0 → plain ETA rejected.
ok('NaN minutes → rejected plain ETA', normalizeEta({ minutes: 'abc', note: 'x', needsHelp: false }).ok === false);

console.log(`\n${fail ? '❌' : '✅'} eta_validation: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Unit test for the receipt↔work-order reconciliation. Run:
//   npx esbuild tests/receipt_reconcile.test.cjs --bundle --format=cjs --platform=node --alias:@=. | node
const assert = require('node:assert');
const { reconcileReceipts, flagLevel, withinTolerance } = require('@/lib/receiptReconcile');

let pass = 0; const ok = (c, m) => { assert.ok(c, m); console.log('  ✓ ' + m); pass++; };

// Tiny material cost (< $25) → never flagged.
ok(reconcileReceipts([{ id: 'j1', material_cost_cents: 1500 }], {}).length === 0, 'tiny material cost ($15) is ignored');

// Real material cost, NO receipt → missing.
const miss = reconcileReceipts([{ id: 'j2', job_number: '101', tech_id: 't1', tech_name: 'Hank', material_cost_cents: 12000 }], {});
ok(miss.length === 1 && miss[0].kind === 'receipt_missing', '$120 cost with no receipt → receipt_missing');
ok(miss[0].tech_name === 'Hank' && miss[0].job_number === '101', 'flag carries tech + work order');

// Receipt matches cost within tolerance → NO flag.
ok(reconcileReceipts([{ id: 'j3', material_cost_cents: 12000 }], { j3: [{ amount_cents: 12500 }] }).length === 0, 'receipt within 10% of cost → no flag');

// Receipt way off → mismatch.
const mm = reconcileReceipts([{ id: 'j4', material_cost_cents: 12000 }], { j4: [{ amount_cents: 4000 }] });
ok(mm.length === 1 && mm[0].kind === 'receipt_mismatch', '$120 cost vs $40 receipt → receipt_mismatch');

// Two receipts that SUM to the cost → matched (no flag).
ok(reconcileReceipts([{ id: 'j5', material_cost_cents: 12000 }], { j5: [{ amount_cents: 7000 }, { amount_cents: 5000 }] }).length === 0, 'two receipts summing to cost → matched');

// $10 absolute tolerance holds even on small jobs.
ok(withinTolerance(3000, 3000 + 900), 'within $9 of cost → tolerated');
ok(!withinTolerance(3000, 3000 + 1100 + 3000 * 0.10), 'beyond both $10 and 10% → not tolerated');

// One warning, then the fee.
ok(flagLevel(0) === 'warning', 'first discrepancy for a tech = warning');
ok(flagLevel(1) === 'fee' && flagLevel(3) === 'fee', 'second+ discrepancy = Doc Fraud Fee');

console.log(`\n${pass} assertions passed.`);

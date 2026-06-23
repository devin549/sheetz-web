# Accounting module — port spec (board AR screens + Accounting Sheet engine)

Agent read 6/23 of `Dispatch_Sheet/dispatchboard_cb_custom_views.html` (the board's AR/money screens)
+ `Accounting_Sheet/` (Ashley's ~20k-LOC engine). This is the spec for the web accounting module.

## The thesis (don't lose this)
**"Ashley sees every dollar. Hong files every form."** It's an anti-embezzlement design:
**the counter (Ashley) is never the check-signer (Tracey)**; physical evidence chains (P-Trap);
**nothing auto-sends to an external party** — every CPA/customer/lawyer outbound is a DRAFT through an
internal approver. Port these structurally (roles + draft-gates), not just the screens.

## What the web app already has ✅
`/past-due` = QuickBooks A/R aging table (per-customer 0-30/31-60/61-90/90+ + total), search/filter/sort,
expand→invoices, **Mark paid → `ar_activity` ledger**, and a **Books Bot** AI. Per-role Claude keys incl.
`ANTHROPIC_KEY_ACCOUNTING`. customers + invoices imported. That covers the AR-table slice; ~25 board
screens + the engine remain.

## 🔑 The efficiency lever — one generic table
The live board powers ~11 of these screens with a single `AcctTableView` component: the server returns
`{cols[], kpis[], buckets[], rows[]}` (column `type` = money/pct/date/bool/status/num/text) and one React
table renders them all. **Build that one component** → Job P&L, Payment Ledger, Credit Cards, Vendor
Credits, WIP/Unbilled, Change Orders, Retainage, Late Fees, Former Employees, Lien Watch, Active Promises
all come almost free. (Column schemas: `CB_Dispatch_AcctViews_v1.js` lines 30-290.)

## The screens (board) — P0 first
| Screen | What it does | Status | Pri |
|---|---|---|---|
| AR Command Center "the Bowl" (`arBowl`) | AR hero: Total, **DSO (avg days-to-pay)**, 90+ at-risk, clickable bucket bar, per-customer worklist + tiered **Draft reminder** | partial (table ✅; +DSO/90+/bar/draft) | P0 |
| Receivables (`receivables`) | CB-native AR; **💵 Cash / 🧾 Check** buttons → record payment (check#/ref) + auto-close job | partial (mark-paid ✅; +cash/check+close) | P0 |
| Payment Links (`paymentLinks`) | Stripe links: awaiting-approval + awaiting-payment; **Send/Skip** gated | missing | P0 |
| Profit Truth / Job Costing (`profitTruth`) | True GP from real tech pay + parts-at-cost + helper; **trust score** (% on real data); cost waterfall | missing | P0 |
| Pending Payrolls (`pendingPay`) | Tracey's weekly **Approve/Deny** queue (Bridge #1, anti-embezzlement) | missing | P0 |
| Doc Fraud (`docFraud`) | Tracey's queue: claims w/o receipts → **Apply $50 fee / Absolve** (Bridge #2) | missing | P0 |
| Billing Watchdog (`billingGuard`) | Unbilled / Undelivered / Unpaid — nothing slips; gated **Resend** | missing | P0 |
| Invoices (`invoices`) | bulk CSV import of legacy invoices + branded PDF | missing | P1 |
| Lien Watch (`lienWatch`) | KY mechanic's-lien pipeline → certified demand → cure countdown → lawyer packet | missing | P1 |
| Bank Position / Payment Ledger / Credit Cards (`bankPosition`,`paymentLedger`,`creditCards`) | cash + money-out + card balances | missing | P1 |
| Payroll Review / Pay & Awards Admin (`payrollReview`,`payAdmin`) | pay from closed jobs + min-wage floor; set rates/awards w/ audit | missing | P1 |
| Customer Portal (`portalAccess`) | token-gated customer dossier + pay-link (no margin shown) | missing | P1 |
| Late Fees / Retainage / Change Orders / WIP / Subs Margin / Vendor Credits / Former Employees / Active Promises | the AcctTable screens | missing | P1/P2 |

## The engine (Accounting Sheet) — workflows to port
- **Receipt pipeline:** scan/email-crawl → **Claude/Vision OCR** (Sonnet Files API + anti-hallucination 3-layer name guard) → classify (CHECK/BILL/RECEIPT/PAYMENT/INSURANCE/LIEN/COURT…) → Job#/Tech match (fuzzy) → **verdict engine** ($5 OR 5% tolerance) → variance/doc-fraud queues (**14-day grace, pay HELD not deducted**).
- **AR cascade:** aging 0-30/30-60/60-90/90-180(lien)/180+(💀 lawyer, never chase) · late fees ($50 admin day 1, 1.5%/mo day 31, idempotent) · dunning ladder (drafts) · **TCPA gate** (8am-8pm + per-channel consent in `_CollectionsConsent`, suppress if paid) · attorney handoff (Fore default / McKinstry, draft recipient only).
- **Payroll:** Sun→Sat week · Sunday immutable snapshot (period-close lock) · pay calc (Crown +$150/Turd +$250 tiers, §19 $7.25 floor, §20 hold) · no-zero/under-count guard · Tue 4:30 **drafts** Hong CSV (not auto-send) behind **PayrollSendGuard** (blocklist + 30-min approval phrase) · garnishment deduction column (KRS 405.991).
- **P-Trap cash custody:** 3 handoffs (tech photo → Ashley scan → office count → bank) · **RAT-flag any variance >$0.01** · 24/48/72h escalation → lockout · CB-# atomic sequence.

## 🤖 AI agents already built — the Books-Bot ladder
Our Books Bot is step 1. The sheet already runs:
- **Finance AI** — daily 7:15am **CFO brief** (AR, WIP, AP due, P-Trap, payroll runway, theft flags) → email. Rule: never recommend chasing 180+ AR.
- **Audit AI** — **hourly anomaly scanner** (high edit volume, off-hours, ≥3 theft flags, garnishment-confirmation deletion). **Calls Claude ONLY on HIGH severity** (cost control; clean scans = $0).
- **Ask Claude** sidebar + **Multi-AI Hub** (8 agents, **$1,500/mo cap**) + shared **cb_kb** knowledge mesh.
- Single caller pattern + PII redaction + per-call cost log. **Re-implement a real per-key budget gate** (the sheet's $1,500 cap is bypassed when a local key is set).

## 🔒 Safety gates — port verbatim (non-negotiable)
1) Separation of duties (counter ≠ signer). 2) **No external send without internal approver** (the 5/12
$0-payroll rule) — drafts only, audit row. 3) PayrollSendGuard kill-switch (blocklist + 30-min phrase).
4) No-zero/under-count payroll guard. 5) TCPA window + consent. 6) Doc-fraud 14-day + variance 24h grace
(HELD, not deducted). 7) Period-close lock. 8) RAT-flag >$0.01. 9) Payment double-credit guard (scanned
PAYMENT queues, never auto-applies). 10) Never chase 180+ AR. 11) Neutralize award names on the CPA CSV.
([[feedback_no_auto_send_to_external_parties]])

## ⚠️ Two bugs to FIX, not replicate
- AR cutoff was hardcoded `2025-08-01` → use rolling **today−90d**.
- Payroll `gross = bonus only` is unwired (doesn't read real Tech Pay col P) → read the real number.

## Recommended web build order
1. **Schema + AcctTable component** — the append/audit tables (`late_fees`, `collections_log`,
   `collections_consent`, customer terms/grace/credit-hold) + the one generic server-driven table. Unblocks ~11 screens.
2. **AR cascade engine** (best ROI on our `/past-due`) — late-fee math + aging + dunning **drafts** + TCPA gate; Mark-paid → auto-flip fees to collected.
3. **Credit-hold + lien/attorney** — DO-NOT-SCHEDULE page + `creditCheck()` + lien state machine + Fore/McKinstry draft.
4. **Receipt pipeline** — Storage upload → Claude OCR (accounting key) → verdict → variance/doc-fraud grace queues.
5. **Cash custody (P-Trap)** + **Payroll** (fix the gross bug) behind the send-guard.
6. **AI ladder** — central per-key budget gate, then Finance AI daily brief + Audit AI HIGH-only scanner + cb_kb mesh. Books Bot inherits the Ask-Claude context pattern.

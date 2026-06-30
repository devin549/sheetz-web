# Adversarial Audit — Clog Busterz / sheetz-web (2026-06-29)

Multi-agent hardcore audit (48 agents, code+logic only — no prod data). **VERDICT: 0 P0, but two
externally-reachable security holes (account-takeover + payment IDOR) plus systemic money-integrity and
never-miss-lead gaps.** Counts: **P1 = 9 · P2 = 11 · P3 = 5.** Most P1s are PRE-EXISTING (live in prod now),
not introduced by the tonight branch.

## SINGLE MOST URGENT
Make `profiles` the sole authority for role in `lib/profile.js` — no profiles row / null role must mean
lowest-privilege/deny, never `meta.role`. Pair with the two IDOR gaps (payment actions + `saveCloseout` need
`canViewJob`) in the same branch.

## P1 — confirmed, worst first

1. **Self-escalation to owner via client-set `user_metadata.role`** — `lib/profile.js:46-48`. A logged-in user
   with no profiles row runs `supabase.auth.updateUser({data:{role:'owner'}})` in devtools; `loadProfile`
   returns `role:'owner'` from metadata → full owner (financials, payroll, mint owners). No RLS backstop.
   Fix: never trust `user_metadata` for role; backfill a profiles row at first login; DB trigger strips client role.
2. **Payment-link / card-charge IDOR** — `my-day/actions.js:14`, `job/[id]/checkoutActions.js:96,127,156`. `jobId`
   is the raw client arg, role-only check (tech holds it), no `canViewJob`. A tech pushes a pay/ACH link or
   card charge against ANY job's invoice + reads customer PII. Fix: `loadJob`+`canViewJob` on every payment action.
3. **`saveCloseout` writes any job's closeout without `canViewJob`** — `job/[id]/actions.js:769-794`. Role check
   only, takes client `jobId`, upserts `job_closeout`. Corrupts another tech's closeout gate + AR. Fix: `getActionContext(job_id)`.
4. **Partial/deposit payment zeroes the FULL invoice balance (lost money)** — `app/api/stripe/webhook/route.js:18-23`.
   `reconcilePaid` sets `balance:0` regardless of amount. $100 deposit on a $2,000 invoice → $1,900 drops out of AR.
   Fix: `newBal = max(0, balance - paidBase)`; `paid` only when `newBal===0`.
5. **Webhook records event id AFTER processing → Stripe retry double-counts AR** — `webhook/route.js:46-64`.
   Check-then-act; `ar_activity` has no unique on `customer_paid`. Fix: insert `stripe_events` FIRST as the claim + unique index.
6. **`markInvoicePaid`/`markCustomerPaid` set status but never zero balance → double-charge** — `past-due/actions.js:104,123`.
   Every collect path keys on `balance`. Office marks cash paid; a tech later re-collects. Fix: set `balance:0, paid_at`.
7. **Min-price floor bypassed by the Present/Send (estimate) path** — `pricebook/estimateActions.js:81,108,196`.
   `recordSale` blocks below-minimum; `createEstimate`/`snapOf`/`approveEstimate` don't. Tech edits a line to $1,
   customer Approves, sub-floor sale booked. Fix: same below-min/margin check in createEstimate + approveEstimate.
8. **`/api/leads` saves a lead with ZERO notification** — `app/api/leads/route.js:39-57`. No Discord/alert/email
   (unlike /api/book + /api/flood-lead). Found only if a human opens /web-leads. Fix: `postToDiscord({to:'office'})`,
   flag "⚠ NO ADDRESS" when null.
9. **Late/silent-tech alerts never escalate** — `lib/alerts.js:33-73`. A re-fire only bumps `seen_count`; nothing
   pages/texts/Discords. Tech goes en-route 8am and never arrives → one in-app task nobody sees. Fix: cron escalation tier.

## P2 (11) — selected
- No watchdog covers `web_leads`/`sales_referrals` (`alertScans.js:102` ALL_SCANS).
- `/web-leads` caps at 100 rows, no status filter — open leads scroll off.
- Address-less `/api/book` HOLD gets `scheduled_at=now()` → drops off board tomorrow (should be NULL).
- `scanRunningLate` ignores `status='hold'` (every web booking in BETA).
- No margin/profit floor on closeout — job can close at 0%/negative.
- Custom / not-in-book lines have NO minimum or margin floor (invisible to margin-watch).
- Margin threshold inconsistent: 59 in code (`marginCoach.js:7`), 55 in copy, 60/55 in SQL.
- No refund/dispute/chargeback handling in the webhook.
- Reader-poll double-record depends on un-run mig 141 (treat as required).
- On-call ack escalation is UI copy only — no deadline scanner.
- **[tonight]** Equipment tag matcher collides — loose substring/digits match (`equipmentActions.js:41`): "148"
  matches a scan of "1489". Fix: exact match (or normalized-exact), not bidirectional `includes`.
- **[tonight]** Job-revenue rollup blind-guesses the EARLIEST active job on checkout (`equipmentActions.js:79`) —
  wrong attribution with 2+ active jobs. Fix: require an explicit job pick or refuse when ambiguous.
- **[tonight]** Auto parts-run clock starts on heuristic false positives — "running to grab lunch" triggers it
  (`chatIntents.js:61` RE_PARTS). Fix: require a parts-noun; or make it propose, not act.

## P3 (5) — selected
- **Gas-over-revenue guard does NOT exist** — only handbook prose (`legalDocs.js:20`). Raw fuel data is bucketed
  in receipts; enforcement isn't built. Backlog: `lib/fuelWatch.js`.
- Low-margin alert only fires on ≥$50 leak within a 2-day window.
- `geofence_leave` declared but no scanner; `running_late` stops at >8h old; chat-late dedupe per-message.

## What held up (solid)
- Cron/webhook auth fails CLOSED (CRON_SECRET, Stripe signature verify).
- Customer `/e/[token]`: token-only, server-recomputed totals, atomic first-write status lock — customer can't move the total.
- Team user-management re-reads `manageUsers` from PROFILES every action; owner grants owner-only.
- Pricebook routes require `apiUser()` + hide cost behind `canSeeCost`. Price-mover invariant holds (AI suggests, owner approves).
- Cost/margin hidden from techs; per-line sale minimum enforced.
- ⚠️ Latent footgun: `canSee` "unmanaged route ⇒ allow" fail-open (`nav.js:338`) — prefer `requirePerm` for non-nav routes.

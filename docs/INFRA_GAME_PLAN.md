# Infrastructure Game Plan — Supabase · Vercel · GitHub

From the three build agents reading the roadmap (6/22). This is the plumbing to support all 5
phases. Pairs with `WEB_MIGRATION_ROADMAP.md` (features) and `BUILD_STATUS.md` (status).

## ⭐ Tomorrow's first moves (do these before feature work)
1. **Rotate `SUPABASE_SERVICE_ROLE_KEY`** (it was pasted in chat once) → update in Vercel → redeploy. Closes the one known exposure.
2. **Run the pending migration `06_helper_assign.sql`**, then **ship `08_jobs_dispatch_harden.sql`** (the keystone — the board can't work without it; also fixes the `enroute` CHECK bug below).
3. **Protect `main`**: add `.github/workflows/ci.yml` (Linux `next build` + gitleaks secret scan) and make it a required check. Now a broken or secret-bearing push can't reach production.
4. **Add a `(public)` route group + fix the middleware matcher** to let public/webhook surfaces through (or lead intake + customer portal will 401).

## 🗄️ SUPABASE (database)
**Bug found:** `seed.sql` inserts `status='enroute'` but `jobs` CHECK only allows
scheduled/on_site/done/cancelled → fix in migration 08 (broaden the CHECK to add enroute/on_my_way).

**Phase-1 migration sequence** (idempotent, RLS-on, run in order):
- **08 jobs harden** ⭐ — add `tech_email, tech_name, assigned_at, started_at, completed_at, lat, lng, address, city, sla_due_at, business_unit, updated_at`; broaden status CHECK; indexes on scheduled_at/tech_email/status. *Unblocks the board, iPad status flow, timesheets, realtime — all at once.*
- **09 job_activity + work_orders + timesheets** — the job-detail timeline + closeout.
- **10 leads** — public-intake target (writes via service_role only; soft-dedupe on phone+day).
- **11 bookings** — CSR booking.
- **12 truck_transfers + tool_loans** — the My Truck actions already owed.
- **13 realtime** — add jobs/job_activity/leads/bookings/helper_assignments to the realtime publication; `replica identity full`.

**New tables later:** payments, receipts, payroll_runs/lines, audit_log (the no-auto-send ledger),
memberships, and a `profiles` table (auth.uid→role) — the prerequisite for real per-user RLS.

**RLS:** stays service_role-server-side for launch (anon sees 0 rows by design = safe). Sensitive,
never-anon tables: customers, invoices, payments, receipts, payroll, tools, truck_inventory,
audit_log, helper_assignments, leads. Per-user RLS policies come in Phase 2 after `profiles` lands.

**Realtime ON:** jobs, job_activity, leads, bookings, helper_assignments. OFF for money/PII tables.

## ▲ VERCEL (hosting)
**Env vars** — server-only except the two `NEXT_PUBLIC_SUPABASE_*`. Phase 1 needs: the Supabase
pair (set ✅), rotated `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_MAPS_KEY` (board), `DISCORD_WEBHOOK_URL`.
Later (per phase): `ANTHROPIC_API_KEY` (highest leverage — get first), `VISION_API_KEY`,
`STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, `EMAIL_API_KEY`, `TWILIO_*`, `VAPI_API_KEY`,
`DEEPGRAM_API_KEY`, `SERPAPI_KEY`, `GOOGLE_PLACES_KEY`, `PLAID_*`. Keep a `.env.example` manifest in sync.

**Structure** — keep `(main)` authed shell; add a **`(public)`** group for `book/` + `portal/[token]/`
(own minimal layout, no sidebar) and an **`app/api/`** tree for integration + webhook routes.
⚠️ **Middleware matcher currently gates everything but auth/** — it will 401 public booking pages and
provider webhooks. Exclude `book|portal|api/leads|api/stripe/webhook|api/twilio` before Phase 1 intake.

**Realtime** is client-only — subscribe in `'use client'` components via `lib/supabase/client.js`;
server component fetches initial rows, client child reconciles. Server actions stay the tool for gated
mutations (keys hidden). Wrap `useSearchParams()` in `<Suspense>` (board/My Day filters) or build fails.

**Hobby-plan walls:** 10s function timeout (AI/OCR/PDF will exceed → stream Claude + queue long jobs);
limited Cron (digests stay on Apps Script for now or go Pro); Hobby is non-commercial. **Go Pro at
Phase 2** (before Stripe goes live). Add DB indexes on board hot-queries before launch.

**Preview→prod:** branch push → Vercel **preview URL** (review there) → merge to main → production
alias updates. Team bookmarks the **alias only**, never a frozen hash URL.

## 🐙 GITHUB (repo/workflow)
**Switch off straight-to-main → feature-branch → preview → squash-merge.** Branch cost is ~10s; a bad
main push breaks production while staff watch. Markdown/docs-only edits can still go straight to main.
Branch naming ties to the roadmap: `phase1/dispatch-board`, `fix/my-day-helper-scope`, `chore/ci`.

**Secret hygiene (a key leaked once):** `.gitignore` is correct, but add (1) a **gitleaks pre-commit
hook** (catches hardcoded keys `.gitignore` can't), and (2) **gitleaks in CI** as a backstop. If a key
ever lands in history: **rotate first** (scrubbing history doesn't un-leak it), update Vercel, redeploy.

**CI:** one lightweight GitHub Action on PRs → `next build` on ubuntu (the authoritative Linux build —
your local Windows crash is a false alarm) + gitleaks. Make `next build` a **required status check** on
main. No tests/lint yet — just "compiles on Linux + no secrets."

**Commits:** one logical change each, imperative + scoped (`Dispatch board: drag-drop assign`), squash
PRs so main reads like a changelog. Author = Devin, no Co-Authored-By in this product repo.

**Tags:** tag each phase completion (`v0.1-phase1` … `v0.5-phase5` → `v1.0`) as rollback anchors +
a progress board. Optional GitHub Release per tag = staff changelog.

## New open loops (added to BUILD_STATUS)
- [ ] Rotate `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Fix `jobs` status CHECK (add enroute) — in migration 08.
- [ ] Run `06_helper_assign.sql`.
- [ ] Add CI workflow + branch protection on main.
- [ ] gitleaks pre-commit hook.
- [ ] Go Vercel Pro before Stripe (Phase 2).

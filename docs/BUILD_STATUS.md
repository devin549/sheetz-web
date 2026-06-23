# Sheetz web app — BUILD STATUS (the one source of truth)

Read this first. It's the running checklist so nothing gets lost or rebuilt twice. Update it as
work lands. Companion files: **`DISPATCH_BOARD_AUDIT.md`** (live-board→web parity gap list, ~95
screens, P0/P1/P2 — the board build queue), **`WEB_MIGRATION_ROADMAP.md`** (the full phased plan from the agent
sweep of all 8 sheets — ~350 features), `API_INTEGRATIONS_BY_ROLE.md` (the AI/API layer per role),
`../lib/roles.js` (the canonical 15-role permission model, ported from the live board).

**Where it runs:** Next.js → Vercel (auto-deploys from GitHub `main`), data in Supabase
(`vwkcxwefqjgbdaeawtir`). Production URL = `sheetz-web-git-main-devin-tackett-s-projects.vercel.app`
(always latest — NOT the hash URLs, those are frozen). Local Windows build crash after
"✓ Compiled successfully" is a false alarm; only that line matters.

## Migration rule (locked)
PORT from the existing Sheets/HTML — do NOT reinvent. The old board + iPad are the spec. Source of
truth for anything already built = `Dispatch_Sheet/` (board: `dispatchboard_*.html` + `CB_Dispatch_*.js`).

## Roles & access — DONE ✅
15 roles ported verbatim from `Dispatch_Sheet/dispatchboard_roles.html` → `lib/roles.js`:
owner/admin · dispatcher · csr · foreman · tech · helper · viewer · customer · gm · om ·
accounting · fs · sales · marketing · shop. Nav + page guards are permission-driven
(`lib/nav.js` + `lib/guard.js` `requireHref`). Unknown role → viewer (safe). Add people via the
**Team** screen (no bulk import — Devin adds as he hires, picks position).

## Screens
| Screen | Route | Status | Notes |
|---|---|---|---|
| Login (email+password) | /login | ✅ live | per-user Supabase auth |
| Account / change password | /account | ✅ live | everyone; sets own password |
| Team (add hire, set role) | /team | ✅ live | manageUsers only; server-enforced |
| Home command center | / | ✅ live | role-aware KPIs + Owner-Sheet tile map |
| Theme | globals.css | ✅ live | **EXACT live-board palette** ported (#0e1116 cool dark + #FF6B00 accent, cream light) from `dispatchboard_index.html` — app-wide, `--amber` aliased to accent |
| Dispatch Board | /board | ✅ live | Dispatch-Live look + drag-drop + NOW line + detail PANEL + status changes + **right-click ContextMenu** (open/duration/en route/on site/complete/call/reassign/send-to-queue/cancel, role-gated) + **Cancel-with-reason** (12-reason taxonomy → cancellations log) + **Set-duration** modal — all ported exactly from the script. ⏳ moveJob hardening (active-tech guard + move audit), realtime, Map/Roster/Week, global search, clickable filters, day-nav, full left-nav, Job Booking |
| My Day | /my-day | ✅ live | self-scoped: tech→own jobs, helper→paired tech, office→all (+?tech) |
| My Truck (fleet + detail) | /my-truck | ✅ live (read) | ⏳ actions: request transfer, loan a tool |
| Shop (reorder + restock) | /shop | ✅ live (read) | ⏳ self-issue review queue (Reed) |
| Customers search | /customers | ✅ live | 13k ST base, CB numbers |
| Past Due (AR) | /past-due | ✅ live | $1.6M, top 100 |
| Light/dark + blinking alerts | (global) | ✅ live | toggle in topbar |

## Tech iPad parity (spec = live `…?techipad=1`, source `CB_Dispatch_TechIpad*` + SPA HTML)
The tech iPad is a whole SPA. My Day is the home tab. Pieces, by status:
- ✅ My Day: self-scoped, date summary (onsite/upcoming/$target), Today tab, rich job cards
  (time · #job# · status pill · customer · 📍addr · 🔧type · $). Migration 07 backs job#/type/$.
- ⏳ My Day extras: search bar (find job/invoice/receipt by #), "View the week", today-date filter,
  drive-time card, **Ask Hank** (AI), gamification strip (rank / Power Plunger Hour / Crown Plunger
  level), **Hand to Customer** + **On shift** toggle, "Synced from Tech Sheet" indicator.
- ⏳ Left-rail sub-screens: Start/End shift, **Bids**, **Chat**, **Hank**, **Pay**, **Races**,
  **Record**, **Vegas**, **Cal**, **PTO**. Each maps to a `CB_Dispatch_*` module — port one at a time.

## 🎯 WOW features (committed — Devin's headline asks, do NOT drop)
The reason 7 months of bridging matters — the moments that make the team go "whoa." All three are
locked here. Each needs a key/provider; none ship as fire-and-forget.
- ⏳ **Mass email button** — send a campaign/notice to many customers at once. ⚠️ GUARDRAIL (non-
  negotiable, per the no-auto-send rule / zero-value payroll incident): it is **draft → preview the
  list + copy → ONE internal approver (Ashley/Tracey/Devin) clicks Send → every send logged to an
  audit table**. NEVER a one-click blast. Needs an email provider (Resend/SendGrid) + `EMAIL_API_KEY`.
  Honor `do_not_mail` on customers. Batch + rate-limit.
- ⏳ **Lawyer packet** — one click assembles a collections/legal packet for an overdue account
  (customer, invoices, aging, comms history, AR cascade record) → PDF for Fore / McKinstry (Devin
  picks the attorney per case). External send stays gated. Ties to the AR cascade already designed.
- ⏳ **Plunger Pete — AI calling** — AI voice agent (Vapi/Bland) that calls on collections + warranty
  + missed-lead follow-up. Needs `VAPI_API_KEY`. Recording URL + outcome logged back to the job/AR.
  Internal-first (test numbers) before any real customer call.

## Widgets / next-level CRM (the web stack's edge over Sheets + ServiceTitan)
Widgets are native here — building them out is a first-class goal, not a nice-to-have.
- ✅ **AR aging widget** — live CSS bars (0-30/31-60/61-90/90+) on the home, from real invoices.
  First proof. Pattern: pure CSS/SVG, no chart lib → keeps the build clean.
- ⏳ Revenue trend, jobs-by-status donut, tech leaderboard, AR/collections funnel.
- ⏳ **Supabase Realtime** — board/jobs/KPIs update live with no refresh (the big differentiator).
- ⏳ Map widget (tech locations / job pins), **Ask Hank** AI panel, drag-drop dispatch.
- ⏳ PWA install + push notifications.

## Next ports (in easiest-first order)
1. ✅ **My Day self-scope + iPad-style cards** — done.
2. ⏳ **Truck actions** — request parts transfer + loan a tool (port from `CB_Dispatch_*Tools*`).
3. ⏳ **Tech iPad extras** — search, week view, then Pay/Bids/Chat sub-screens.
4. ⏳ **Dispatch board** — the big one. Spec = `dispatchboard_app.html` + endpoints.
5. ⏳ **Booking / intake**, then the AI/API layer per `API_INTEGRATIONS_BY_ROLE.md`.

## Open loops / owed
- [ ] **Rotate `SUPABASE_SERVICE_ROLE_KEY`** (pasted in chat once) — do first, update Vercel, redeploy.
- [ ] Run `supabase/06_helper_assign.sql` in Supabase (helper pairings table).
- [ ] **Fix `jobs` status CHECK** — seed inserts `enroute` but CHECK rejects it; broaden in migration 08.
- [ ] Add **CI** (`.github/workflows/ci.yml`: Linux `next build` + gitleaks) + **branch protection** on main.
- [ ] gitleaks **pre-commit hook** locally.
- [ ] Add `app/api/` + a `(public)` route group; **fix middleware matcher** (let `book|portal|api/leads|api/stripe/webhook|api/twilio` through).
- [ ] Go **Vercel Pro** before Stripe goes live (Phase 2).
- [ ] Devin's own login password — change it on /account (was set in chat earlier).
- [ ] 2FA (Supabase MFA) — the board has email-2FA; port when ready.
- See **`INFRA_GAME_PLAN.md`** for the full Supabase/Vercel/GitHub plan + tomorrow's first moves.

## Migrations run (Supabase SQL editor)
02 customers ST cols · 03 CB numbers · 04 invoices AR · 05 truck+tools · 06 helper_assign · 07 job card
fields · 08 jobs harden — **run ✅ (6/22)**. (Note: helper_assignments uses `time_window`, not
`window` — reserved word.) **PENDING to run: 09 techs_crew (crew grouping), 10 cancellations+duration.**
Later: leads, bookings, truck_transfers+tool_loans, realtime.

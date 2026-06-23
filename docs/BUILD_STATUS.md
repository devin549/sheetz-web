# Sheetz web app — BUILD STATUS (the one source of truth)

Read this first. It's the running checklist so nothing gets lost or rebuilt twice. Update it as
work lands. Companion files: **`ACCOUNTING_PORT.md`** (the accounting module spec — board AR screens +
Accounting Sheet engine, ~25 screens + workflows + AI-agent ladder + safety gates), **`DISPATCH_BOARD_AUDIT.md`** (live-board→web parity gap list, ~95
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
| Dispatch Board | /board | ✅ live | Dispatch-Live look + drag-drop + NOW line + detail PANEL + status changes + **right-click ContextMenu** (open/duration/en route/on site/complete/call/reassign/send-to-queue/cancel, role-gated) + **Cancel-with-reason** (12-reason taxonomy → cancellations log) + **Set-duration** modal — all ported exactly from the script. ✅ **moveJob hardening**: `assignTech` now refuses to move done/cancelled jobs + writes a **move-audit row** to `job_moves` (mig 17, action=assign/reassign/unassign/reschedule). ✅ **Map / Roster / Week / Capacity** secondary views (ported from `dispatchboard_views.html`, crew-grouped since our data has no zone yet) via a client tab switcher. ⏳ realtime, global search, clickable filters, day-nav, full left-nav, Job Booking |
| My Day (TECH IPAD home) | /my-day | ✅ live | **Field-only nav** (tech+helper `seeOwnOnly`; removed from owner/office). Self-scoped: tech→own, helper→paired, office→all (+?tech). **Tech field actions:** big touch status buttons 🚚 En route → 📍 On site → ✓ Complete (`updateMyJobStatus`, stamps enroute/started/completed) + 🧭 Navigate (maps) + 📞 Call + 📷 **Job file** link. ⏳ rail sub-tabs (Bids/Chat/Hank/Pay/Races/Record/Cal/PTO), week view, search, on-shift toggle, gamification strip |
| Job File / CB Cam | /job/[id] | ✅ live | Per-job photo spine through a **private Supabase Storage** bucket (`job-photos`) + `job_photos` table. Header (customer/tech/amount/status) + signed-URL gallery: kinds (before/during/after/receipt/damage/equipment/closeout), tags, caption, **customer-visible packet** flag, upload + archive, role/helper access gate. Linked from My Day + board panel. **Run `supabase/23_job_photo_spine.sql` first.** ⏳ HEIC server-side preview, equipment data-plate decode, close-gate on failed photo |
| My Truck (fleet + detail) | /my-truck | ✅ live (read) | ⏳ actions: request transfer, loan a tool |
| Shop (reorder + restock) | /shop | ✅ live (read) | ⏳ self-issue review queue (Reed) |
| Customers search | /customers | ✅ live | 13k ST base, CB numbers |
| Accounts Receivable | /past-due | ✅ live | **Cleaned up (AR = heart of ops):** clickable aging summary IS the filter (one bucket UI, no duplicate chips) · **🎯 Top Deadbeats** strip (5 biggest balances, click→jump) · tight header · Books Bot moved BELOW the list (data first) · **PDF docs grouped** in each row: 📄 Statement + 📄 Certified letter + ⚖️ Lawyer packet. QuickBooks aging table + search/sort + Mark-paid→`ar_activity` + Books Bot. **Collections cascade** (ported from `_CollectionsLog`+Lien Watch, mig 13): per-customer **address** + contact **timeline** (text/email/call/certified/lawyer-packet) w/ dunning-ladder next-action + lien escalation. ⏳ actually-send drafts (email/SMS provider, gated), statement PDF, partial payments, Stripe pay-link |
| Light/dark + blinking alerts | (global) | ✅ live | toggle in topbar |
| 📱 Mobile shell | (global) | ✅ live | rail collapses ≤820px → floating ☰ button + slide-in drawer (closes on navigate). App is usable on a phone for owner/supervisors in the field. ⏳ dedicated mobile board *agenda* view (grid still scrolls horizontally on phone) |
| Board polish (15-min/late/hover) | /board | ✅ live | 15-min slot lines **hidden** (hour lines only) · **late alerts** (overdue + not rolling/onsite/done → red block + blinking dot) · **hover info card** (customer/time/dur/status/addr/type/$/tech/phone without clicking) |
| AI — per-role Claude keys | lib/anthropic.js | ✅ wired | one key per position (owner/gm/office/accounting/sales/marketing/tech/helper + fallbacks); model `claude-opus-4-8`; usage logged to `ai_usage` (mig 11) for GM/Owner rollup |
| AI — Ask the Board (Hank) | / (home) | ✅ live | seeReports roles; answers plain-English Qs from live jobs/AR/customers. Needs an `ANTHROPIC_KEY_*` in Vercel |

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
- ✅ **Mass email button** — `/campaigns` (nav "📣 Mass Email"). **Guardrail enforced in code**
  (separation of duties): *compose* seats (marketing/sales/office/GM/owner via `canCompose`) draft +
  preview the exact list; only an *approver* (`APPROVER_ROLES` = owner/GM/Tracey-OM/Ashley-accounting)
  can click **Approve & Send**. Audiences: past-due / 90+ / all-with-email. `do_not_mail` + empty/dupe
  emails auto-skipped (counted, shown). Recipient list snapshotted into `email_sends` at submit so it
  can't shift; **every send logged** (sent/failed/skipped) + campaign audit in `email_campaigns`
  (mig 14). 🪄 "Draft with Hank" writes subject+body via the role's Claude key; `{{name}}` personalized
  per recipient. Provider = Resend REST (`lib/email.js`), no SDK dep — works in draft/approve mode now;
  **actual send gated on `EMAIL_API_KEY` + `EMAIL_FROM`** in Vercel. Batches of 50. **Pick-a-batch:**
  "Preview & pick" shows the full recipient checklist (search, select-all/none, live count) → hand-pick
  exactly who goes out, or tick "entire audience" for the full blast. Server re-validates email/
  do_not_mail (client only chooses which resolved recipients to include). _Setup owed: run
  `supabase/14_email_campaigns.sql`; add `EMAIL_API_KEY`/`EMAIL_FROM` when ready to send for real._
- ✅ **Lawyer packet** — `/past-due/packet/[cid]` assembles a print-clean collections/lien referral:
  letterhead + attorney block (Fore **or** McKinstry, `?firm=` toggle) + debtor (name/CB#/address/phone/email)
  + amount-due summary + aging + full invoice schedule + collections-history table (good-faith attempts)
  + KY statutory refs (KRS 376 lien / 6-mo window, KRS 413.090/413.120). **🖨️ Print / Save as PDF** (no PDF
  lib — `@media print` hides app chrome → clean white doc in light OR dark). Opened from the AR timeline
  **⚖️ Build lawyer packet** button (logs a `packet` contact). External send still gated.
- ✅ **Plunger Pete — AI calling** — `/pete` ("📞 Plunger Pete"), ported from `Owner_Sheet/
  CB_Owner_PP_Vapi_v1.js` (Vapi REST `/call`, E.164 normalize, status enum, refusals, transcript log,
  webhook callback). Purposes: collections / warranty / missed-lead. **Two safety rails in code:**
  (1) **internal-test-first** — a "test call" only dials numbers on the `PETE_TEST_NUMBERS` allowlist
  (can’t back-door a real number through test mode); (2) **approver release** — a real customer call
  sits `queued` until an approver (`canApprovePete` = owner/GM/Tracey-OM/Ashley-accounting) clicks
  Approve & Call. Every call logged to `pete_calls` (mig 15) w/ recording URL + summary + outcome via
  the **`/api/vapi` webhook** (secret-verified; middleware now lets `/api/*` through). Collections
  context (balance + days-late) auto-fed to the assistant. Launchable from the AR timeline (**📞 Call
  with Pete**, prefilled). Provider gated on `VAPI_API_KEY`/`VAPI_PHONE_NUMBER_ID`/`VAPI_ASSISTANT_ID`
  (+ `VAPI_WEBHOOK_SECRET`, `PETE_TEST_NUMBERS`). _Setup owed: run `supabase/15_pete_calls.sql`; add the
  VAPI_* env + point the Vapi assistant Server URL at `/api/vapi?secret=…`._

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
fields · 08 jobs harden · 09 techs_crew · 10 cancellations+duration · 11 ai_usage · 12 ar_activity ·
13 collections_log — **all run ✅ (6/23)**. (Note: helper_assignments uses `time_window`, not `window`
— reserved word.) **14 email_campaigns + email_sends — ⏳ NOT RUN YET** (mass-email audit tables; run
`supabase/14_email_campaigns.sql`). **15 pete_calls — ⏳ NOT RUN YET** (Plunger Pete AI-call log; run
`supabase/15_pete_calls.sql`). **16 certified_proof — ⏳ NOT RUN YET** (collections_log tracking/
proof/delivered cols + `collections-evidence` storage bucket; run `supabase/16_certified_proof.sql`).
**17 job_moves — ⏳ NOT RUN YET** (board move/activity audit; run `supabase/17_job_moves.sql`).
**18 email_opens — ⏳ NOT RUN YET** (email_sends opened_at/open_count for ST/FieldEdge-style open
tracking; run `supabase/18_email_opens.sql`). **19 ar_notes — ⏳ NOT RUN YET** (per-customer A/R
notes = Ashley's Notes column; run `supabase/19_ar_notes.sql`). **All (14–19) bundled in
`supabase/RUN_ALL_PENDING_14_15_16.sql` for one paste.** Email opens also need `APP_URL` in Vercel
(or auto via Vercel's production URL) so the tracking pixel has a public origin.
**23 job_photo_spine — ⏳ NOT RUN YET** (Job File photo spine: `job_photos` table + private
`job-photos` Storage bucket; run `supabase/23_job_photo_spine.sql`). RLS is enabled with **no
policies by design** — only the server's service-role client touches photos (via signed URLs),
so anon/authenticated are denied by default; do not add permissive policies.

**AR = Ashley's book (port of her ST AR report; ST being abandoned):** per-customer **📝 Notes**
(editable, shows inline on the row; "DO NOT SERVICE" flags red) + **📄 AR aging report** at
`/past-due/report` — printable full-book aging (Customer · Current · 30 · 60 · 90 · Over 90 · Total ·
Notes + grand totals), matching her exact columns. Her real book totals ~$290k. **🚫 Doubtful/bad-debt
flag** (mig 20): per-invoice + per-customer "too old to count on" → excluded from collectible AR
(headline now "$X collectible · $Y doubtful (not counted)") but kept owed (still on statement + lawyer
packet). Email opens surface in the timeline (✉️ sent · 📭 opened). **⬆️ Import A/R** at
`/past-due/import` — paste a ST customer+open-invoice CSV → creates customers + open invoices (column
auto-detect, dupe-invoice skip, preview-then-import) so reports go live with real data.
Later: leads, bookings, truck_transfers+tool_loans, realtime.

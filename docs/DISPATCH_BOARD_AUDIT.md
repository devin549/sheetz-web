# Dispatch Board — Parity Audit (live script → web app)

Agent audit 6/23 of the live board source (`dispatchboard_app.html`, `…_cb_custom_views.html`
(~19.5k lines / ~95 screens), `…_panel.html`, `…_timegrid.html`, + the `CB_Dispatch_*` endpoints).

## The verdict (be honest)
The web board has the **scheduler chassis** — 24h time grid, drag-drop assign, now-line, crew rows,
jobs tray, KPI cards. But the live board is **~95 screens + a full job-action layer + a booking/AR/
reports system**. The web app currently covers **~5 of ~95 screens**, and has **zero "do something
to a job"** UI. This doc is the build list to close it.

Three buckets are missing: (1) **job actions** (click→panel, status changes, cancel, context menu),
(2) **the screens** (booking, web leads, AR, reports, shop, sales, intel — ~90 of them), (3) the
**shell** (grouped role nav, global search, filters that filter, KPI goals, view modes, BU filter).

## 🔴 P0 — can't run a dispatch day without these
| Gap | What it is | Size | Source |
|---|---|---|---|
| **Job detail panel** | Click a block → side panel: customer (tap-to-call, address→Maps), status, schedule, billing, notes, action bar | M | `dispatchboard_panel.html` JobPanel |
| **Status changes** | Mark **En route / On site / Complete** (server `updateJobStatus`; completed stamps completedISO + customer rollups; optimistic + role-gate + rollback) | M | `CB_Dispatch_BoardWebApp` |
| **Right-click context menu** | Per-job: Open / Set duration / En route / On site / Complete / Call / Reassign / Send to queue / Cancel — role-gated (no dead-ends) | M | `dispatchboard_panel.html` ContextMenu |
| **Cancel-with-reason** | Modal w/ 12-code taxonomy (+ conditional note) → cancellations log → feeds AI win-back. NOT a plain delete | M | `dispatchboard_app.html` lines 49-62 |
| **moveJob hardening** | Our drag-assign is missing the safety logic: block reassigning an en route/on site tech, block moving done/cancelled, write a move-audit row, notify both techs | M | `cbDispatchBoard_moveJob` |
| **Job Booking** | The only way new work enters: booking form w/ credit-hold hard-block, insurance-claim guard, referral/consent capture, ST-parity fields | L | `CB_Dispatch_Booking` |
| **Web Leads + Booking Requests** | Inbound queues → confirm to a job (same credit-hold gate); badge counts | M | `CB_Dispatch_WebLeads` |
| **Grouped role nav** | 8 collapsible sections (Follow-up / Customers / Accounting / Field Ops / Sales & Mktg / Reports / Setup / More) + 5 pinned ops screens, role-filtered. Web has a flat 9-item rail | L | `…_cb_live_bridge.html` |
| **Clickable filter chips** | All / Idle / En route / On site / Late / Complete actually filter the grid (web only shows counts) | M | `dispatchboard_app.html` StatusTabs |
| **Global search** | Header search across jobs / customers / addresses / IDs | M | TopBar |
| **Day nav** | Today button + date picker + ◀▶ prev/next day | M | SubToolbar |
| **KPI dashboard** | Scope presets (Today/Week/Month/YTD) + goal bars + pace% + Completed/Estimates/Collected | M | `…_cb_dashboard_v2.html` |
| **Carryover banner** | Flags jobs left open from prior days (dismissible, surfaces stale jobs into the tray) | M | `cbCarryover_scan` |

## 🟡 P1 — the differentiators (after P0)
- **Customer Dossier drill** behind the existing search (history, photos, balance, jobs)
- **AR suite:** AR Command Center, Job P&L, Invoices, full Receivables, **Payment Links** (Stripe)
- **Sales:** Open Estimates follow-up (2h/24h), Selling Opportunities, Sales board
- **Smart layer:** closest-free-tech **availability** (GPS + skill rank), **running-late** escalation (incl. anti-theft left-open detector), appointment **reminders** (consent-gated)
- **Field ops:** Teams/Crews, Truck Par restock, Purchase Orders, Price Book, Tech Spend & Waste, Job Tags, **Messages** unanswered-text guard
- **Reports:** Revenue Reports, Scorecard/FTFR, Dispatch Score, Job Records
- **Views:** Map + Roster renderers (real, not placeholders); resize-to-set-duration
- **Server foundation P1 needs:** a tech-GPS/location store, a geocoder, the labor timeline

## ⚪ P2 — the long tail (~60 screens)
Accounting ledgers (bank position, cards, payment ledger, WIP, change orders, retainage, late fees,
liens, doc-fraud, billing guard), deep shop (counter, parts recon, vendor price book, slotting, stock
map, barcode, Ferguson crawl, tool checkout), Growth Intel (SEO/competitor — SerpAPI), Ask-the-Board +
Cancel/Tech Intel + Smart Dispatch (Anthropic), Plunger Pete recovery (Vapi), Call Desk AI (webhook +
Deepgram), gamification (The Pit / Vegas / Crown), restoration (FB Breakdown / Subs Margin / Xactimate),
Work Order spine (built-but-unwired on the sheet too), Photo Review, permits, memberships, portal access.

## 🔒 Rules that MUST carry forward into every port
- **No auto-send to customers** — enforced server-side in 3 places: reminders SMS **HELD** when no
  consent on file (fail-safe), running-late customer texts are **drafts**, web-lead coupons are
  **notes-only**. Port the gates, not just the happy path. ([[feedback_no_auto_send_to_external_parties]])
- **Role-gate every mutation** (context menu hides items for read-only roles; server returns role_denied).
- **Optimistic update + rollback** on every status/move change.
- **Credit-hold hard-block** on booking + web-lead confirm (protects AR).
- **Move audit** (`_DB_JobMoves` equivalent) on every reassign/reschedule.

## Recommended next build order
1. **updateJobStatus** (S, P0) — smallest, highest value; en route/on site/complete.
2. **Job detail panel + right-click menu** (M, P0) — unlocks status/cancel/reassign/detail in one shot.
3. **Cancel-with-reason** + **moveJob hardening** (M, P0).
4. **Clickable filters + global search + day nav** (M, P0) — shell usability.
5. **Job Booking** (L, P0) — work intake, with credit-hold.
6. **Grouped role nav + Web Leads/Booking Requests** (P0) — then into P1.

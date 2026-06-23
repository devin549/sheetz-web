# Clog Busterz → Web App — MIGRATION ROADMAP

Built 6/22 from a full agent sweep of all 8 Apps Script projects (~350+ distinct features
inventoried). This is the phased plan to take the whole ecosystem web-based. Companion:
`BUILD_STATUS.md` (what's shipped), `API_INTEGRATIONS_BY_ROLE.md` (keys per role).

**Reality check:** this is a 4–6 month migration to full parity; an MVP that runs the daily
business (field + dispatch + booking) is ~6–8 weeks. We go phase by phase, strangler-style — the
old Sheets/board stay LIVE until each piece reaches parity, so the business never stops.

## The numbers (what the agents found)
| Project | Features | Heaviest areas |
|---|---|---|
| Dispatch (board + tech iPad) | ~125 | board grid, tech SPA, payments, AI/Hank, inventory |
| Owner + GM | ~143 | call intel, reviews/heat, payroll guard, competitor intel, HR |
| Accounting | ~80 | receipts/OCR, AR/collections, payroll, anti-theft, gamification |
| OM + FS | ~33 | payroll/fraud approval gates, scorecards, 811 compliance, QA |
| WebIntake + Tech + FloodBusterz | ~30 | lead intake, license/receipt/voice capture, drying/Xactimate |

## ✅ Phase 0 — DONE (foundation)
Per-user auth + the canonical **15-role permission model**, nav/guards, light/dark, blinking
alerts. Screens: Home command center, My Day (self-scoped + iPad cards), My Truck, Shop, Customers,
Past Due, Team admin, Account. First widget (AR aging). 3 build agents + this roadmap.

## 🔑 The unlock table (one key flips many features on)
Most of the app needs no key. These providers gate the rest — get them and whole phases light up:
| Provider | Env var | Unlocks |
|---|---|---|
| **Anthropic** | `ANTHROPIC_API_KEY` | Hank everywhere, Ask-the-Board, job summaries, OCR, coaching, cancel insights, all AI briefs |
| **Vision/OCR** | (Anthropic Files API or `VISION_API_KEY`) | receipt capture, equipment/data-plate read, license scan, Xactimate |
| **Stripe** | `STRIPE_SECRET_KEY` | field card checkout (Terminal) + payment links + 4% fee |
| **Email** | `EMAIL_API_KEY` (Resend) | mass email (gated), invoice/statement send, digests |
| **Vapi** | `VAPI_API_KEY` | Plunger Pete AI calling |
| **Twilio** | `TWILIO_*` | SMS reminders, review/heat alerts, opt-out |
| **Google Maps** | `GOOGLE_MAPS_KEY` | address verify, closest-tech, drive time, customer maps |
| **Plaid** | `PLAID_*` | live bank balance, cash position, anomaly flags |
| **SerpAPI** | `SERPAPI_KEY` | competitor rank, SEO gaps, marketing intel |
| Discord | `DISCORD_WEBHOOK_URL` | internal #sheetz alerts + tech chat |

## 📦 Phase 1 — Field + Dispatch MVP (the daily driver) — START HERE
Goal: a tech, a dispatcher, and a CSR can run a full day in the web app.
- **Dispatch board** (`/board`) — live job grid, drag-drop assign, status, closest-tech. `CB_Dispatch_BoardWebApp`, `SmartDispatch`, `TechLocation`. **L**. Dep: Maps.
- **Job detail / work order** (`/job/[id]`) — timeline, timesheet, purchases, quote, invoice, photos, closeout. `WorkOrder`, `JobActivity`. **L**.
- **Tech iPad rest** — truck actions (transfer/loan), van check, job status flow, photo upload, closeout, on-shift/Hand-to-Customer, search, week view. `TechIpadApi/Html`, `HelpRequest`, `VideoUpload`. **L**.
- **Booking** (`/booking`) — CSR book + availability suggester + address verify + lead source + coupons. `Booking`, `Availability`, `AddressVerify`. **M**. Dep: Maps.
- **Web lead intake** (`/api/leads` + `/leads`) — public site → leads inbox, dispatcher confirms. `WebIntake`, `WebLeads`. **M**.
- Cross-cutting: turn on **Supabase Realtime** so the board/My Day update live (the WOW).

## 💰 Phase 2 — Money (the trust layer)
- **Payments** — Stripe Terminal + links, 4% fee, daily money digest, receipts. **M**. Dep: Stripe, Email.
- **Invoicing** — branded PDF w/ photos + signatures, gated send. **M**. Dep: Email.
- **AR / collections** — aging command center, statements, late-fee engine, billing watchdog, consent/TCPA log. **M/L**.
- **Payroll** — accrual on job close → OM approval gate → Accounting run → Hong CPA CSV; back-charge floor; send-guard anti-embezzlement. **L**. (Honor the approval bridges.)
- **Receipts/OCR** — capture → classify → Job#/tech match → doc-fraud gate. **M**. Dep: Vision.
- ⚠️ All external sends stay **draft → internal approver → logged**.

## 🤖 Phase 3 — AI layer + the WOW features
- **Hank** everywhere (job summaries, Ask-the-Board, photo-review learning, translate). Dep: Anthropic.
- **Plunger Pete — AI calling** (collections/warranty/missed-lead). Dep: Vapi.
- **Mass email button** (gated) + **Lawyer packet** PDF (Fore/McKinstry). Dep: Email.
- **Call intelligence** — transcribe + score + attribute (LSA/dispatch.me). Dep: Deepgram/Whisper.
- **Equipment intel** — data-plate OCR + "heaters >10yr" campaign + gas-type guard. Dep: Vision.
- Widgets: revenue trend, jobs-by-status, tech leaderboard, AR funnel, customer map.

## 🧑‍✈️ Phase 4 — Leadership cockpits + compliance + morale
- **Owner** command center (master dashboard, morning brief, reviews/heat detector, promise tracker, payroll guard, Plaid cash, licenses/workers-comp).
- **GM** (Ronnie) — KPI dashboard, today's mission, AI 1:1 coach, competitor hub, job-hole watch, heat SLA.
- **OM** (Tracey) — payroll/fraud approval gates, staff scorecard, on-call + phone rotation, **811 safety gate**.
- **FS** — ridealongs, QA audit log, callback tracker, escalations, equipment.
- **Gamification** — Power Plunger Hour, trophy case, Crown/Turd, races, streaks (the culture layer).

## 🌐 Phase 5 — Customer-facing
- **Customer portal** (token-gated) — see jobs/invoices/equipment, approve proposals, pay.
- **Self-service online booking** (public 24/7).
- **Memberships** (recurring plans + reminders), **referrals**, **reviews** request flow.

## Cross-cutting (build into every phase)
Realtime everywhere · widgets/charts · PWA install + push · the no-auto-send approval rule ·
keys server-side only · port logic from the `/test` mirrors first (fastest, already node-tested).

## Tomorrow's first move
Start Phase 1 at the **Dispatch board** (biggest daily surface, makes everything else make sense) and
finish the **tech iPad** in parallel. Booking + lead intake right behind. Realtime on as soon as the
board renders. Everything tracked here + in BUILD_STATUS.md — no re-deciding, just execute.

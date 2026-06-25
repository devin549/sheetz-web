# Tech iPad → Sheetz Web — Parity Inventory

Source of truth: `Unc/cb-tech-html-audit/decoded-techipad.html` (the live Apps Script Tech iPad SPA,
base64-decoded) + the Apps Script API/photo files in that folder. **Goal: lose no information from the
HTML.** Every pane + feature below is tracked. Status: ✅ built · 🟡 partial · ⬜ todo.

Rules (Devin): tech app is **job-first**, no office sidebar, no accounting/admin/customer-list clutter.
Supervisor/office reviews photos pass/fail; failed photos are **circled + explained**; tech sees the
failed proof and uploads corrected proof. **One photo system** only: `job_photos`, `job_photo_reviews`,
`job_photo_annotations`, `audit_log`, `job_media_rules`.

## Nav items (27) — HTML rail → web

| HTML nav | pane | Web route | Status |
|---|---|---|---|
| 🌅 Start (start-of-day) | `sod` | — | ⬜ todo (pre-trip, tools check, helper confirm, handbook re-sign) |
| 📋 My Day | `day` | `/my-day` | 🟡 list built; cockpit-grade card todo |
| 🧲 Bids | `estimates` | — | ⬜ todo (tech's open estimates/bids) |
| 🌙 End (end-of-day) | `eod` | — | ⬜ todo (wrap-up, unreturned tools, tomorrow preview) |
| 💬 Chat | `chat`/`comms` | `/messages` | 🟡 partial |
| 🪠 Hank | overlay | `/hank` | ✅ |
| 💵 Pay | `pay` | `/pay` | ✅ ported (sample data) |
| 🏁 Races | `races` | — | ⬜ todo |
| 🏆 Record | `record` | — | ⬜ todo |
| 🎰 Vegas | `board`/`vegas` | — | ⬜ todo |
| 📆 Cal | `cal` | `/cal` | ✅ ported (sample data) |
| 📅 PTO | `pto` | `/pto` | ✅ ported (sample data) |
| ⭐ Reviews | `reviews` | `/reviews` | 🟡 partial |
| 🚐 My Truck | `tools`/`van` | `/my-truck` | 🟡 partial (My Tools read; van maintenance todo) |
| 🛒 Shop | `shopco`/`shop` | `/shop` | ✅ |
| 💧 Dry Calc | `drycalc` | — | ⬜ todo (FloodBusterz only) |
| 💦 Moisture | `moisture` | — | ⬜ todo (FloodBusterz only) |
| 📣 Mkt | `mkt` | — | ⬜ todo |
| ⚙ Set | `settings` | `/account` | 🟡 partial |

## Job Cockpit (the `#drawer` view) — the centerpiece

The screen after a tech taps a job. Work-order rail: **Overview · Forms · Photos · Estimate · Invoice ·
PO · Prices · Equip · History**. Web home: `/job/[id]`.

| Cockpit feature (HTML) | Web status | Where / note |
|---|---|---|
| Customer + job# + address header | ✅ | `job/[id]/page.js` |
| Quick-contact bar: 📞 Call (recorded) · 💬 Text · 🎙 CSR Call · 🗺 Directions | 🟡 | call/text/map present; "recorded" + CSR-call playback todo |
| Customer notes card (dogs, gate code, prefs, prior callbacks) | ⬜ | **info to preserve** — add to job header |
| Customer warnings / flags | ⬜ | **info to preserve** — add to job header |
| Leave-by / running-late alert (green→amber→red) | 🟡 | RunningLate delay buttons on My Day card; leave-by widget todo |
| Workflow strip: Rolling→Arrived→Diagnose→Present→Pay→📸+🎬→Done | ✅ | `JobFlow.js` (7-step rail + ONE Next Action) |
| 🎯 ONE Next Action card | ✅ | `JobFlow.js` |
| Status buttons (enroute/on-site/done) | ✅ | `JobFlow.js` + `setJobStatus` |
| Delay buttons (+15/+30/+45, need help) — office-only, never auto-text | ✅ | My Day `JobCard` `reportEta` |
| Forms (closeout questions) | ✅ | `JobForms.js` + `job_closeout_questions` |
| Estimate builder / Price Book | 🟡 | `/estimate` exists; in-cockpit tab todo |
| Invoice + Receipt | 🟡 | `/invoices` office; in-cockpit todo |
| Parts / PO | 🟡 | `JobParts.js` (issued/rentals + return gate) |
| Prices (price book) | 🟡 | `/estimate` partial |
| Equipment on file (warranty status) | ⬜ | todo (`cbTechIpad_getCustomerEquipment`) |
| History (prior jobs) | ⬜ | todo |
| Payment collection (pay link) | ✅ | `JobCard` `createJobPayLink` |
| Closeout requirements checklist | ✅ | gate: media + dispo + rentals + questions (`lib/qa.js`) |

## Photos / Video evidence (`pane-videos`) + the CB Cam spine

| Feature (HTML) | Web status | Note |
|---|---|---|
| Photo capture + list, kinds (before/during/after/receipt/damage/equipment/closeout) | ✅ | `JobPhotos.js` + `job_photos` |
| Guided photos (shot-by-shot, required shots gate closeout) | 🟡 | media rule `required_kinds`; guided UI todo |
| BEFORE/AFTER walkthrough **video** required to close | 🟡 | `require_video` flag in `job_media_rules`; per-type enforce todo |
| Supervisor pass/fail review | ✅ | `JobPhotos.js` review + `job_photo_reviews` |
| **Failed photo CIRCLED (annotation)** | ⬜→building | `job_photo_annotations` exists, was unused — wiring now |
| **Tech sees failed proof (circle + reason)** | ⬜→building | wiring now |
| **Tech uploads corrected proof** | ⬜→building | wiring now (reuses `job_photos`) |
| Close-gate blocks on open fail | ✅ | `computeCloseout` openFails |
| Supervisor override (logged) | ✅ | `overrideCloseout` + `audit_log` |
| Cross-device "add from my phone" (same WO) | ⬜ | todo |
| AI photo pre-scan / learned defects (close-gate basis) | ⬜ | todo (PhotoFail/PhotoReview vision) |

## Not-yet-ported screens (full list, so none are lost)
`sod` Start-of-Day · `eod` End-of-Day · `estimates` Bids · `receipt` · `finance` financing ·
`customer` detail · `races` · `record` · `board`/`vegas` · `mkt` · `van` maintenance · `formfill` ·
`drycalc` + `moisture` (FloodBusterz). Each is a tracked follow-up slice.

## Build order (Devin-approved focus)
1. **This slice:** Tech Job Cockpit shell (full rail, nothing dropped) + connect Photos to the spine +
   complete the **failed → circled → corrected** loop on the existing tables.
2. Add the cockpit info we don't want to lose: **customer notes + warnings** on the job header.
3. Then by value: Start/End of day, Bids, Equipment, History, guided photos + video gate, Races/Record/Vegas, financing, Mkt.

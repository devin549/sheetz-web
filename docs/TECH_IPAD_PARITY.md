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

---

# 6/27 update — full gold re-extraction (agents) + current status

Much of the above is now DONE (My Day rich port, job cockpit, Start, Bids, Pay, Races, Customer 360,
Settings, Calendar week-stepper). Re-extracted the gold (`mockups/tech_ipad_v3.html`) for the remaining
ports. See also [[reference_tech_ipad_backend_contract]].

**Decisions (Devin 6/27):** ID Part → Truck tab + EVERY work order. Shop (after-hours material) → a
SECTION INSIDE My Truck, not a top tab. iPad nav (side rail vs bottom) = Devin sleeping on it; currently
bottom bar on touch devices (any orientation), side rail on mouse desktop. Bottom tabs: Start · My Day ·
Bids · Truck · Chat · Hank · More (or all, scrollable — pending his call).

**Key finding — Calendar:** `pane-cal` is a static **Google-Calendar agenda** (callbacks/inspections/
training/PTO/on-call), NOT a job grid. The real "week view" = the My Day **date-bar + `cbChangeDay`
stepper**, ALREADY ported (‹ › day flips). Job source for both = `getMyDay(email, isoDate)`. Remaining:
optionally bring the Calendar Bridge events (`cbCal_listUpcoming_`) across; wire other-day job cards to
`/job/[id]` (gold left them non-clickable).

**My Truck (`pane-tools` 5607–5990)** — 4 sub-tabs via `switchTruckSub`: My Van (scan box + 4-stat card
{partsOnVan, inventoryValue, lowStockCount, daysSinceRestock} + top-6 most-used + low-stock alerts + full
inventory) · Truck-Wide Search (fleet → shop/other-vans/transfer) · Shop Inventory (Richmond/Lexington
toggle + per-shop stats + categorized stock) · My Tools custody ({toolsIssued,issuedValue,onLoan,missing}
+ active loans + serialized tools w/ condition photos). Scan: `cbInv_compare(code)` →
`{ok,name,sku,shopCost,techPrice,customerPriceFromShop,vendor{name,price},warehouses[{warehouseId,qty,bin}],
verdict}`. Add-to-job: `cbInv_scanOut({sku,qty,tech,jobId})`. Tables: parts/truck_inventory, shop_inventory
(per-loc), tools, tool_loans, tool_condition_photos.

**Shop self-checkout (`pane-shopco` 5992–6084) → My Truck sub-tab** — form Job#(prefill active job) ·
Part(scan/type) · Qty · Note → `cbTechIpad_selfIssue({jobId,sku,qty,note,confirm})` (tech from SESSION,
never client email). Returns `{needsConfirm,warning}` (job# typo confirm round-trip) / `{ok:false,error}` /
`{ok:true,qty,name,jobId,afterHours,message}`. Engine `cbShop_selfIssueCore_` (`CB_Dispatch_ShopIssue_v1.js`):
part lookup → typo gate → van-only guard → after-hours stamp (weekend OR hr<7 OR ≥17 ET) → custPrice =
round2(techPrice × markup, default 1.5) → append `_DB_ShopIssues` (19-col ledger) → decrement stock. Cost
on the JOB never tech pay; every pull tagged `[SELF-SERVE]`/`[· after-hours]` for Reed. Web: `shop_issues`
table + `/api/shop/self-issue` + manager review (`cbShop_selfServeReport`).

**ID Part / Equipment plate** — gold = data-plate CAMERA (NOT a part-Lens). `openPlateCapture` → role
modal (🆕 installed → equipment+warranty+auto-permit `cbPermit_request` · 🗑 removed · 🔧 existing) →
`cbTechIpad_scanEquipmentPlate` → `cbEquip_captureFromPhoto` → Anthropic vision `cbEquip_scanPlateB64_` →
`{detected,category,manufacturer,model,serial,gasType:'NAT|LP|ELECTRIC|UNKNOWN',capacity,btuInput,mfgDate,
ageYears}`. **gasType read ONLY off the plate "TYPE GAS" field — never inferred (fuel-safety gas-gate).**
Web: photo→Storage→`/api/equipment/scan-plate`→vision→upsert `equipment` by customer_phone + unit_role;
installed → insert `permit_requests`. The SerpAPI/Lens "identify unknown part by photo" = separate queued
build ([[project_part_identifier]]).

**Still ⬜:** End of Day, Van Maintenance, Dry Calc/Moisture (FloodBusterz), the `pane-cal` Google agenda.
Cross-cutting: Customer Mode (`data-tech-only` server-side by role), gas-gate, video-evidence invoice lock,
after-hours on-call-FS routing, idle re-auth.

**❌ NOT WANTED (Devin 6/27): the 🎰 Vegas tab / casino-slots gamification — do NOT build it.** (The
Power Plunger "roll for a bonus" on Start stays; Vegas as a separate achievements/slots tab does not.)
Record/Leaderboard gamification = de-prioritized unless Devin asks.

# Tech iPad — web port spec (the "90% done" cheat sheet)

Source of truth = the live tech iPad (`?techipad=1`), code in `Dispatch_Sheet/CB_Dispatch_TechIpad*`
+ `mockups/tech_ipad_full_mockup.html` / `tech_ipad_v3.html` / `_ipad_decoded.html`. **Port it — don't
reinvent.** This doc is the running checklist for the web port (lives in `app/(main)/my-day` + new routes).

## Screens / rail tabs (the iPad's left rail)
| Tab | What it shows | Web status |
|---|---|---|
| **My Day** (home) | today's jobs (time · status · customer · 📍addr · 🔧type · 📞), date stats (onsite/upcoming/done/$target), clock in/out | ✅ ported (cards + status actions + Navigate/Call); ⏳ clock in/out, ETA, drawer |
| **Start / End of day** | clock in + availability / clock out + recap, tips, ratings | ⏳ |
| **Bids** (estimates) | pending estimates, price-book Good/Better/Best, add-ons | ⏳ |
| **Chat** | dispatch ↔ tech messages, unread badges | ⏳ (needs realtime) |
| **Hank** (Plumber's Brain) | AI Q&A — KY code, water heaters, drains, mfg specs | 🔨 building now (we have Claude keys) |
| **Pay** (tech-only) | daily earnings, advances, paycheck, commission | ⏳ (needs Tech Pay data) |
| **Races / Record / Vegas** (tech-only) | leaderboard + badges / career stats / slot-machine gamification | ⏳ |
| **Cal / PTO** | week calendar + on-call / time-off requests + approval | ⏳ |
| **Reviews** | customer micro-reviews + ratings | ⏳ (ties to Happy Checks) |
| **My Truck** | parts/tools, stock | ✅ exists (`/my-truck`) |
| **Shop** | self-checkout SKU pull + after-hours flag | ✅ exists (`/shop`) |
| **Dry Calc / Moisture** (FloodBusterz crew) | drying calc + moisture logger | ⏳ |
| **Settings** | profile, notifications, device PIN, watermark | ⏳ |

## Job-detail drawer (tap a card) — the rich part
- Customer block + flags (VIP/Repeat/Rental/Past-Due/Rating), phone/address/property/balance, job history at address
- **7-step workflow strip**: Rolling → Arrived → Diagnosed → Presenting → Pay → Photos → Done (timestamps + progress bar)
- **Smart Suggest** panel (changes per step): call "5 min out", maps, customer notes, PlumberBrain causes, price tiers, payment methods, photo checklist, review prompt
- **Live ETA**: on-site since / est finish / drive to next / ETA at next + 🟢🟡🟠🔴 slack badge (texts next customer if late)
- **🔥 10-min burner**: duration check-in overlay → lock est duration → recalc ETA → text next customer if >15 late
- Action grid: 🧾 Snap Receipt · 📷 Photo · 📞 Call · 📦 Add Part · 📝 Note · 🗺️ Navigate

## Server functions the iPad calls (→ web data needs)
`cbTechIpad_getMyDay(email)` → today's jobs + stats (✅ ported in /my-day) · `cbTechIpad_search` (job/customer/addr/phone) · `cbTechIpad_rollJob` (reschedule, parts/weather) · `cbTechIpad_sendInvoice` (branded PDF + photos email) · `cbTechIpad_selfIssue` (shop self-pull, after-hours flag — ✅ exists in /shop concept) · `cbTechIpad_getCustomerEquipment` / `scanEquipmentPlate` (water-heater nameplate OCR + warranty) · `cbTechIpad_closeGate` (block close if photos failed) · `cbTechIpad_hankFeedback` (👍/👎 + correction → manager review) · `cbTechIpad_logSecurityEvent` (screenshot/watermark forensics). Identity = email matched to Owner Roster → role (TECH/DISPATCHER/MANAGER) + isFB + payType.

## Theme (iPad)
Dark `#0e1116` bg, surfaces `#11151c/#161a22/#1d222c`, amber `#FFB300`, green `#4caf50`, red `#ff5560`,
blue `#4f9bff`. Rail 80px, big touch targets (68px icons, 40px buttons), JetBrains Mono for times/IDs,
drawer slides from right. (Our web theme already matches the board palette.)

## Port order (proposed — highest value first)
1. ✅ My Day cards + field actions (status / Navigate / Call) — done
2. 🔨 **Hank** (AI Q&A) — self-contained, uses our Claude keys — building now
3. **Clock in/out** + Start/End of day (hours → feeds payroll)
4. **Job drawer** (workflow steps + action grid + Snap Receipt/Photo/Note)
5. **Pay** (needs tech pay data in Supabase)
6. **Bids/estimates**, **Cal/PTO**, **Reviews** (ties to Happy Checks), **Chat** (realtime)
